import net, { type Socket } from "node:net";
import path from "node:path";

export const DAEMON_PROTOCOL_VERSION = "1";
export const DEFAULT_ELECTRON_DAEMON_CONNECT_TIMEOUT_MS = 2_000;
export const DEFAULT_ELECTRON_DAEMON_REQUEST_TIMEOUT_MS = 10_000;

const DEFAULT_RECONNECT_BACKOFF_MS = [250, 500, 1_000, 2_000] as const;

export interface DaemonConnectionError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type DaemonConnectionResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: DaemonConnectionError };

export interface DaemonConnectionContext {
  isReconnect: boolean;
  request<T>(
    method: string,
    params?: Record<string, unknown>,
    options?: { timeoutMs?: number },
  ): Promise<DaemonConnectionResult<T>>;
}

export interface DaemonReconnectInfo {
  attempt: number;
  delayMs: number;
  reason: unknown;
}

export interface DaemonDisconnectInfo {
  reason: unknown;
}

export interface DaemonEventFrame {
  event: string;
  payload: unknown;
  ts?: unknown;
}

export interface DaemonConnectionLifecycleHooks {
  onConnected?: (context: DaemonConnectionContext) => Promise<void> | void;
  onReconnected?: (context: DaemonConnectionContext) => Promise<void> | void;
  onDisconnected?: (info: DaemonDisconnectInfo) => void;
  onReconnectScheduled?: (info: DaemonReconnectInfo) => void;
  onEvent?: (event: DaemonEventFrame) => void;
}

export interface DaemonConnectionManagerOptions {
  socketPath: string;
  connectTimeoutMs?: number;
  requestTimeoutMs?: number;
  reconnectBackoffMs?: readonly number[];
  connect?: (socketPath: string) => Socket;
  requestIdFactory?: () => string;
  hooks?: DaemonConnectionLifecycleHooks;
}

export interface DaemonConnectionManager {
  start(): void;
  stop(): void;
  isConnected(): boolean;
  setHooks(hooks: DaemonConnectionLifecycleHooks): void;
  request<T>(
    method: string,
    params?: Record<string, unknown>,
    options?: { timeoutMs?: number },
  ): Promise<DaemonConnectionResult<T>>;
}

interface PendingRequest {
  id: string;
  resolve: (result: DaemonConnectionResult<unknown>) => void;
  timeout: ReturnType<typeof setTimeout>;
}

interface ActiveConnection {
  socket: Socket;
  pending: Map<string, PendingRequest>;
  buffer: string;
  closed: boolean;
  dispose: () => void;
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
  error: DaemonConnectionError;
}

class ElectronDaemonConnectionManager implements DaemonConnectionManager {
  private readonly socketPath: string;
  private readonly connectTimeoutMs: number;
  private readonly requestTimeoutMs: number;
  private readonly reconnectBackoffMs: readonly number[];
  private readonly connect: (socketPath: string) => Socket;
  private readonly requestIdFactory: () => string;

  private hooks: DaemonConnectionLifecycleHooks;
  private running = false;
  private connecting = false;
  private hasConnectedOnce = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private activeConnection: ActiveConnection | null = null;
  private requestChain: Promise<void> = Promise.resolve();

  constructor(options: DaemonConnectionManagerOptions) {
    this.socketPath = options.socketPath;
    this.connectTimeoutMs = normalizeTimeout(
      options.connectTimeoutMs,
      DEFAULT_ELECTRON_DAEMON_CONNECT_TIMEOUT_MS,
    );
    this.requestTimeoutMs = normalizeTimeout(
      options.requestTimeoutMs,
      DEFAULT_ELECTRON_DAEMON_REQUEST_TIMEOUT_MS,
    );

    const backoff =
      options.reconnectBackoffMs && options.reconnectBackoffMs.length > 0
        ? options.reconnectBackoffMs
        : DEFAULT_RECONNECT_BACKOFF_MS;
    this.reconnectBackoffMs = backoff.map((value) => normalizeTimeout(value, 250));

    this.connect = options.connect ?? ((socketPath: string) => net.createConnection(socketPath));
    this.requestIdFactory = options.requestIdFactory ?? createRequestId;
    this.hooks = options.hooks ?? {};
  }

  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    void this.attemptConnect();
  }

  stop(): void {
    this.running = false;
    this.connecting = false;
    this.hasConnectedOnce = false;
    this.reconnectAttempt = 0;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.activeConnection) {
      this.closeConnection(this.activeConnection, {
        reason: new Error("Daemon connection manager stopped"),
        shouldReconnect: false,
      });
    }
  }

  isConnected(): boolean {
    return this.activeConnection !== null;
  }

  setHooks(hooks: DaemonConnectionLifecycleHooks): void {
    this.hooks = hooks;
  }

  async request<T>(
    method: string,
    params: Record<string, unknown> = {},
    options?: { timeoutMs?: number },
  ): Promise<DaemonConnectionResult<T>> {
    const timeoutMs = normalizeTimeout(options?.timeoutMs, this.requestTimeoutMs);

    const resultPromise = this.requestChain.then(() =>
      this.sendRequest<T>(method, params, timeoutMs),
    );

    this.requestChain = resultPromise.then(
      () => undefined,
      () => undefined,
    );

    return resultPromise;
  }

  private async attemptConnect(): Promise<void> {
    if (!this.running || this.connecting || this.activeConnection) {
      return;
    }

    this.connecting = true;

    const socketResult = await connectSocket(this.socketPath, this.connectTimeoutMs, this.connect);

    this.connecting = false;

    if (!this.running) {
      if (socketResult.ok) {
        socketResult.value.destroy();
      }
      return;
    }

    if (!socketResult.ok) {
      this.scheduleReconnect(socketResult.error);
      return;
    }

    const isReconnect = this.hasConnectedOnce;
    const active = this.createActiveConnection(socketResult.value);
    this.activeConnection = active;

    const lifecycleResult = await this.runLifecycleHooks(isReconnect);
    if (!lifecycleResult.ok) {
      this.closeConnection(active, {
        reason: lifecycleResult.error,
        shouldReconnect: true,
      });
      return;
    }

    this.hasConnectedOnce = true;
    this.reconnectAttempt = 0;
  }

  private createActiveConnection(socket: Socket): ActiveConnection {
    const connection: ActiveConnection = {
      socket,
      pending: new Map<string, PendingRequest>(),
      buffer: "",
      closed: false,
      dispose: () => {
        socket.off("data", onData);
        socket.off("error", onError);
        socket.off("close", onClose);
      },
    };

    const onData = (chunk: string) => {
      if (connection.closed) {
        return;
      }

      connection.buffer += chunk;
      const lines = connection.buffer.split("\n");
      connection.buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length === 0) {
          continue;
        }

        let frame: unknown;
        try {
          frame = JSON.parse(trimmed) as unknown;
        } catch (error) {
          this.closeConnection(connection, {
            reason: {
              code: "BAD_RESPONSE",
              message: "Daemon returned invalid JSON frame",
              details: {
                parseError: getErrorMessage(error),
              },
            },
            shouldReconnect: true,
          });
          return;
        }

        this.handleFrame(connection, frame);
      }
    };

    const onError = (error: unknown) => {
      this.closeConnection(connection, {
        reason: error,
        shouldReconnect: true,
      });
    };

    const onClose = () => {
      this.closeConnection(connection, {
        reason: new Error("Daemon connection closed"),
        shouldReconnect: true,
      });
    };

    socket.setEncoding("utf8");
    socket.on("data", onData);
    socket.on("error", onError);
    socket.on("close", onClose);

    return connection;
  }

  private handleFrame(connection: ActiveConnection, frame: unknown): void {
    const parsed = parseIncomingFrame(frame);

    if (!parsed.ok) {
      this.closeConnection(connection, {
        reason: parsed.error,
        shouldReconnect: true,
      });
      return;
    }

    if (parsed.kind === "event") {
      this.hooks.onEvent?.(parsed.value);
      return;
    }

    const pending = connection.pending.get(parsed.value.id);
    if (!pending) {
      return;
    }

    connection.pending.delete(parsed.value.id);
    clearTimeout(pending.timeout);

    if (parsed.kind === "error") {
      pending.resolve({
        ok: false,
        error: parsed.value.error,
      });
      return;
    }

    pending.resolve({
      ok: true,
      value: parsed.value.result,
    });
  }

  private async runLifecycleHooks(isReconnect: boolean): Promise<DaemonConnectionResult<void>> {
    const context: DaemonConnectionContext = {
      isReconnect,
      request: <T>(
        method: string,
        params: Record<string, unknown> = {},
        options?: { timeoutMs?: number },
      ) => this.request<T>(method, params, options),
    };

    try {
      await this.hooks.onConnected?.(context);
      if (isReconnect) {
        await this.hooks.onReconnected?.(context);
      }
      return { ok: true, value: undefined };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Daemon connection lifecycle hook failed",
          details: {
            reason: getErrorMessage(error),
          },
        },
      };
    }
  }

  private closeConnection(
    connection: ActiveConnection,
    options: { reason: unknown; shouldReconnect: boolean },
  ): void {
    if (connection.closed) {
      return;
    }

    connection.closed = true;
    connection.dispose();

    if (this.activeConnection === connection) {
      this.activeConnection = null;
    }

    for (const pending of connection.pending.values()) {
      clearTimeout(pending.timeout);
      pending.resolve({
        ok: false,
        error: {
          code: "DAEMON_UNAVAILABLE",
          message: "Daemon connection closed before response was received",
        },
      });
    }
    connection.pending.clear();

    try {
      connection.socket.end();
      connection.socket.destroy();
    } catch {
      // Ignore socket teardown failures.
    }

    this.hooks.onDisconnected?.({ reason: options.reason });

    if (options.shouldReconnect) {
      this.scheduleReconnect(options.reason);
    }
  }

  private scheduleReconnect(reason: unknown): void {
    if (!this.running) {
      return;
    }

    if (this.reconnectTimer) {
      return;
    }

    const delayMs =
      this.reconnectBackoffMs[Math.min(this.reconnectAttempt, this.reconnectBackoffMs.length - 1)];
    this.reconnectAttempt += 1;

    this.hooks.onReconnectScheduled?.({
      attempt: this.reconnectAttempt,
      delayMs,
      reason,
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.attemptConnect();
    }, delayMs);
  }

  private async sendRequest<T>(
    method: string,
    params: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<DaemonConnectionResult<T>> {
    const connection = this.activeConnection;
    if (!this.running || !connection || connection.closed) {
      return {
        ok: false,
        error: {
          code: "DAEMON_UNAVAILABLE",
          message: "Daemon connection is not available",
          details: {
            method,
          },
        },
      };
    }

    const id = this.requestIdFactory();
    const request: ProtocolRequestFrame = {
      id,
      method,
      params,
    };

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        connection.pending.delete(id);
        resolve({
          ok: false,
          error: {
            code: "TIMEOUT",
            message: `Daemon request timed out after ${timeoutMs}ms`,
            details: {
              method,
              timeoutMs,
            },
          },
        });
      }, timeoutMs);

      connection.pending.set(id, {
        id,
        resolve: resolve as (result: DaemonConnectionResult<unknown>) => void,
        timeout,
      });

      try {
        connection.socket.write(`${JSON.stringify(request)}\n`);
      } catch (error) {
        clearTimeout(timeout);
        connection.pending.delete(id);
        resolve({
          ok: false,
          error: {
            code: "DAEMON_UNAVAILABLE",
            message: getErrorMessage(error),
            details: {
              method,
            },
          },
        });
      }
    });
  }
}

export function createDaemonConnectionManager(
  options: DaemonConnectionManagerOptions,
): DaemonConnectionManager {
  return new ElectronDaemonConnectionManager(options);
}

export function resolveDaemonSocketPath(storagePath: string): string {
  const socketOverride = process.env.TODU_DAEMON_SOCKET;
  if (socketOverride && socketOverride.trim().length > 0) {
    return path.resolve(socketOverride);
  }

  return path.join(storagePath, "daemon.sock");
}

interface ParsedEvent {
  event: string;
  payload: unknown;
  ts?: unknown;
}

function parseIncomingFrame(
  frame: unknown,
):
  | { ok: true; kind: "success"; value: ProtocolSuccessFrame }
  | { ok: true; kind: "error"; value: ProtocolErrorFrame }
  | { ok: true; kind: "event"; value: ParsedEvent }
  | { ok: false; error: DaemonConnectionError } {
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
      value: {
        event: frame.event,
        payload: frame.payload,
        ts: frame.ts,
      },
    };
  }

  if (isRecord(frame.error)) {
    const id = frame.id;
    if (typeof id === "string" || id === null) {
      const error = frame.error;
      if (typeof error.code === "string" && typeof error.message === "string") {
        return {
          ok: true,
          kind: "error",
          value: {
            id,
            error: {
              code: error.code,
              message: error.message,
              details: isRecord(error.details) ? error.details : undefined,
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

async function connectSocket(
  socketPath: string,
  timeoutMs: number,
  connect: (socketPath: string) => Socket,
): Promise<DaemonConnectionResult<Socket>> {
  return new Promise((resolve) => {
    let settled = false;
    const socket = connect(socketPath);

    const cleanup = () => {
      socket.off("error", onError);
      socket.off("connect", onConnect);
    };

    const finish = (result: DaemonConnectionResult<Socket>) => {
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
      socket.destroy();
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

function mapConnectError(socketPath: string, source: unknown): DaemonConnectionError {
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

  return "Unexpected daemon connection error";
}

let requestCounter = 0;

function createRequestId(): string {
  requestCounter += 1;
  return `electron-${Date.now()}-${requestCounter}`;
}
