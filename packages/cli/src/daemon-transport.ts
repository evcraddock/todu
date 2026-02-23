import net, { type Socket } from "node:net";

export const DAEMON_PROTOCOL_VERSION = "1";
export const DEFAULT_CLI_DAEMON_CONNECT_TIMEOUT_MS = 1_000;
export const DEFAULT_CLI_DAEMON_REQUEST_TIMEOUT_MS = 10_000;

export interface DaemonTransportError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type DaemonTransportResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: DaemonTransportError };

export interface DaemonTransportClient {
  request<T>(
    method: string,
    params?: Record<string, unknown>,
    options?: { timeoutMs?: number },
  ): Promise<DaemonTransportResult<T>>;
}

export interface DaemonTransportClientOptions {
  socketPath: string;
  connectTimeoutMs?: number;
  requestTimeoutMs?: number;
  protocolVersion?: string;
  connect?: (socketPath: string) => Socket;
  requestIdFactory?: () => string;
}

export interface InvokeDaemonMethodOptions extends DaemonTransportClientOptions {
  method: string;
  params?: Record<string, unknown>;
  timeoutMs?: number;
}

export function createDaemonTransportClient(
  options: DaemonTransportClientOptions,
): DaemonTransportClient {
  const connectTimeoutMs = normalizeTimeout(
    options.connectTimeoutMs,
    DEFAULT_CLI_DAEMON_CONNECT_TIMEOUT_MS,
  );
  const requestTimeoutMs = normalizeTimeout(
    options.requestTimeoutMs,
    DEFAULT_CLI_DAEMON_REQUEST_TIMEOUT_MS,
  );
  const protocolVersion = options.protocolVersion ?? DAEMON_PROTOCOL_VERSION;
  const connect = options.connect ?? ((socketPath: string) => net.createConnection(socketPath));
  const requestIdFactory = options.requestIdFactory ?? createRequestId;

  return {
    async request<T>(
      method: string,
      params: Record<string, unknown> = {},
      requestOptions?: { timeoutMs?: number },
    ): Promise<DaemonTransportResult<T>> {
      const timeoutMs = normalizeTimeout(requestOptions?.timeoutMs, requestTimeoutMs);
      const socketResult = await connectSocket(options.socketPath, connectTimeoutMs, connect);
      if (!socketResult.ok) {
        return socketResult;
      }

      const socket = socketResult.value;
      const reader = createJsonLineReader(socket);

      try {
        const helloResponse = await sendRequestFrame(
          socket,
          reader,
          {
            id: requestIdFactory(),
            method: "daemon.hello",
            params: { protocolVersion },
          },
          timeoutMs,
        );

        if (!helloResponse.ok) {
          return helloResponse;
        }

        if (!isProtocolHelloResult(helloResponse.value.result, protocolVersion)) {
          return {
            ok: false,
            error: {
              code: "BAD_RESPONSE",
              message: "Daemon hello response is missing expected protocol metadata",
            },
          };
        }

        const response = await sendRequestFrame(
          socket,
          reader,
          {
            id: requestIdFactory(),
            method,
            params,
          },
          timeoutMs,
        );

        if (!response.ok) {
          return response;
        }

        return {
          ok: true,
          value: response.value.result as T,
        };
      } finally {
        reader.dispose();
        socket.end();
        socket.destroy();
      }
    },
  };
}

export async function invokeDaemonMethod<T>(
  options: InvokeDaemonMethodOptions,
): Promise<DaemonTransportResult<T>> {
  const client = createDaemonTransportClient(options);
  return client.request<T>(options.method, options.params ?? {}, {
    timeoutMs: options.timeoutMs,
  });
}

interface ProtocolRequestFrame {
  id: string;
  method: string;
  params: Record<string, unknown>;
}

interface ProtocolSuccessFrame {
  id: string;
  result: unknown;
}

interface ProtocolErrorFrame {
  id: string | null;
  error: DaemonTransportError;
}

interface JsonLineReader {
  next(timeoutMs: number): Promise<unknown>;
  dispose(): void;
}

interface PendingNext {
  resolve: (frame: unknown) => void;
  reject: (error: unknown) => void;
}

function createJsonLineReader(socket: Socket): JsonLineReader {
  let buffer = "";
  const queue: unknown[] = [];
  const pending: PendingNext[] = [];

  const onData = (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        continue;
      }

      const parsed = parseJsonFrame(trimmed);
      if (!parsed.ok) {
        rejectPending(parsed.error);
        continue;
      }

      if (pending.length > 0) {
        const waiter = pending.shift();
        waiter?.resolve(parsed.value);
      } else {
        queue.push(parsed.value);
      }
    }
  };

  const onError = (error: unknown) => {
    rejectPending(error);
  };

  const onClose = () => {
    rejectPending(new Error("Daemon connection closed before response was received"));
  };

  const rejectPending = (error: unknown) => {
    while (pending.length > 0) {
      const waiter = pending.shift();
      waiter?.reject(error);
    }
  };

  socket.setEncoding("utf8");
  socket.on("data", onData);
  socket.on("error", onError);
  socket.on("close", onClose);

  return {
    next(timeoutMs: number): Promise<unknown> {
      if (queue.length > 0) {
        const frame = queue.shift();
        return Promise.resolve(frame);
      }

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          removePending(waiter);
          reject(
            new Error(
              `Timed out waiting for daemon response frame after ${Math.floor(timeoutMs)}ms`,
            ),
          );
        }, timeoutMs);

        const waiter: PendingNext = {
          resolve: (frame) => {
            clearTimeout(timeout);
            resolve(frame);
          },
          reject: (error) => {
            clearTimeout(timeout);
            reject(error);
          },
        };

        pending.push(waiter);
      });
    },

    dispose(): void {
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("close", onClose);
      rejectPending(new Error("Daemon response reader disposed"));
    },
  };

  function removePending(waiter: PendingNext): void {
    const index = pending.indexOf(waiter);
    if (index >= 0) {
      pending.splice(index, 1);
    }
  }
}

async function sendRequestFrame(
  socket: Socket,
  reader: JsonLineReader,
  request: ProtocolRequestFrame,
  timeoutMs: number,
): Promise<DaemonTransportResult<ProtocolSuccessFrame>> {
  try {
    socket.write(`${JSON.stringify(request)}\n`);
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "DAEMON_UNAVAILABLE",
        message: getErrorMessage(error),
      },
    };
  }

  const startedAt = Date.now();

  while (true) {
    const elapsed = Date.now() - startedAt;
    const remaining = timeoutMs - elapsed;
    if (remaining <= 0) {
      return {
        ok: false,
        error: createRequestTimeoutError(request.method, timeoutMs),
      };
    }

    let frame: unknown;
    try {
      frame = await reader.next(remaining);
    } catch (error) {
      return {
        ok: false,
        error: mapReaderError(error, request.method, timeoutMs),
      };
    }

    const parsed = parseIncomingFrame(frame);
    if (!parsed.ok) {
      return {
        ok: false,
        error: parsed.error,
      };
    }

    if (parsed.kind === "event") {
      continue;
    }

    if (parsed.value.id !== request.id) {
      continue;
    }

    if (parsed.kind === "error") {
      return {
        ok: false,
        error: parsed.value.error,
      };
    }

    return {
      ok: true,
      value: parsed.value,
    };
  }
}

async function connectSocket(
  socketPath: string,
  timeoutMs: number,
  connect: (socketPath: string) => Socket,
): Promise<DaemonTransportResult<Socket>> {
  return new Promise((resolve) => {
    let settled = false;
    const socket = connect(socketPath);

    const cleanup = () => {
      socket.off("error", onError);
      socket.off("connect", onConnect);
    };

    const finish = (result: DaemonTransportResult<Socket>) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      cleanup();
      resolve(result);
    };

    const onConnect = () => {
      finish({ ok: true, value: socket });
    };

    const onError = (error: unknown) => {
      finish({
        ok: false,
        error: mapConnectError(socketPath, error),
      });
    };

    const timeout = setTimeout(() => {
      socket.destroy();
      finish({
        ok: false,
        error: {
          code: "DAEMON_UNAVAILABLE",
          message: `Timed out connecting to daemon socket after ${Math.floor(timeoutMs)}ms`,
          details: {
            socketPath,
            timeoutMs: Math.floor(timeoutMs),
          },
        },
      });
    }, timeoutMs);

    socket.once("connect", onConnect);
    socket.once("error", onError);
  });
}

function mapConnectError(socketPath: string, source: unknown): DaemonTransportError {
  const code = errorCode(source);
  if (code === "ENOENT" || code === "ECONNREFUSED" || code === "EACCES" || code === "EPERM") {
    return {
      code: "DAEMON_UNAVAILABLE",
      message: `Daemon unavailable at socket: ${socketPath}`,
      details: {
        socketPath,
        reason: code,
      },
    };
  }

  return {
    code: "INTERNAL_ERROR",
    message: getErrorMessage(source),
    details: {
      socketPath,
      reason: code,
    },
  };
}

function parseJsonFrame(payload: string): DaemonTransportResult<unknown> {
  try {
    return {
      ok: true,
      value: JSON.parse(payload) as unknown,
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "BAD_RESPONSE",
        message: "Daemon returned invalid JSON response",
        details: {
          parseError: getErrorMessage(error),
        },
      },
    };
  }
}

function parseIncomingFrame(
  frame: unknown,
):
  | { ok: true; kind: "success"; value: ProtocolSuccessFrame }
  | { ok: true; kind: "error"; value: ProtocolErrorFrame }
  | { ok: true; kind: "event" }
  | { ok: false; error: DaemonTransportError } {
  if (!isRecord(frame)) {
    return {
      ok: false,
      error: {
        code: "BAD_RESPONSE",
        message: "Daemon response frame must be an object",
      },
    };
  }

  if (typeof frame.event === "string") {
    return {
      ok: true,
      kind: "event",
    };
  }

  if (isRecord(frame.error)) {
    const protocolError = frame.error;
    if (typeof protocolError.code === "string" && typeof protocolError.message === "string") {
      const id = frame.id;
      if (typeof id === "string" || id === null) {
        return {
          ok: true,
          kind: "error",
          value: {
            id,
            error: {
              code: protocolError.code,
              message: protocolError.message,
              details: isRecord(protocolError.details) ? protocolError.details : undefined,
            },
          },
        };
      }
    }
  }

  if (typeof frame.id === "string" && "result" in frame) {
    return {
      ok: true,
      kind: "success",
      value: {
        id: frame.id,
        result: frame.result,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: "BAD_RESPONSE",
      message: "Daemon response frame shape is invalid",
    },
  };
}

function mapReaderError(error: unknown, method: string, timeoutMs: number): DaemonTransportError {
  if (isDaemonTransportError(error)) {
    return error;
  }

  if (error instanceof Error && error.message.startsWith("Timed out waiting for daemon response")) {
    return createRequestTimeoutError(method, timeoutMs);
  }

  if (
    error instanceof Error &&
    error.message === "Daemon connection closed before response was received"
  ) {
    return {
      code: "DAEMON_UNAVAILABLE",
      message: error.message,
      details: {
        method,
      },
    };
  }

  return {
    code: "INTERNAL_ERROR",
    message: getErrorMessage(error),
    details: {
      method,
    },
  };
}

function createRequestTimeoutError(method: string, timeoutMs: number): DaemonTransportError {
  return {
    code: "TIMEOUT",
    message: `Daemon request timed out after ${timeoutMs}ms`,
    details: {
      method,
      timeoutMs,
    },
  };
}

function isDaemonTransportError(value: unknown): value is DaemonTransportError {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.code === "string" && typeof value.message === "string";
}

function isProtocolHelloResult(value: unknown, expectedProtocolVersion: string): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return value.protocolVersion === expectedProtocolVersion;
}

function normalizeTimeout(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  if (value < 1) {
    return fallback;
  }

  return Math.floor(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorCode(error: unknown): string | undefined {
  if (!isRecord(error)) {
    return undefined;
  }

  return typeof error.code === "string" ? error.code : undefined;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unexpected daemon transport error";
}

let requestCounter = 0;

function createRequestId(): string {
  requestCounter += 1;
  return `cli-${Date.now()}-${requestCounter}`;
}
