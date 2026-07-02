import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import {
  normalizeConfigPaths,
  resolveConfigPath,
  resolveDataDir,
  type ToduFileConfig,
} from "@todu/core";
import { parse } from "yaml";

export const DAEMON_PROTOCOL_VERSION = "1";
export const DEFAULT_TUI_DAEMON_CONNECT_TIMEOUT_MS = 2_000;
export const DEFAULT_TUI_DAEMON_REQUEST_TIMEOUT_MS = 10_000;
export const DEFAULT_TUI_RECONNECT_BACKOFF_MS = [250, 500, 1_000, 2_000] as const;

export type DaemonConnectionStateName =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "failed";

export interface DaemonConnectionError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type DaemonConnectionResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: DaemonConnectionError };

export interface DaemonHelloResult {
  protocolVersion: string;
  daemonVersion?: string;
  role?: string;
  capabilities?: unknown;
  catalog?: unknown;
}

export interface DaemonConnectionSnapshot {
  state: DaemonConnectionStateName;
  socketPath: string;
  hello: DaemonHelloResult | null;
  error: DaemonConnectionError | null;
  reconnectAttempt: number;
  reconnectDelayMs: number | null;
}

export type DaemonConnectionListener = (snapshot: DaemonConnectionSnapshot) => void;

export interface DaemonEventFrame {
  event: string;
  payload: unknown;
  ts?: string;
}

export type DaemonEventListener = (event: DaemonEventFrame) => void;

export interface DaemonConnection {
  start(): void;
  stop(): void;
  getSnapshot(): DaemonConnectionSnapshot;
  subscribe(listener: DaemonConnectionListener): () => void;
  subscribeEvents(listener: DaemonEventListener): () => void;
  request<T>(
    method: string,
    params?: Record<string, unknown>,
    options?: { timeoutMs?: number },
  ): Promise<DaemonConnectionResult<T>>;
}

export interface DaemonSocket {
  setEncoding(encoding: BufferEncoding): this;
  on(event: "connect", listener: () => void): this;
  on(event: "data", listener: (chunk: string) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  on(event: "close", listener: () => void): this;
  once(event: "connect", listener: () => void): this;
  once(event: "error", listener: (error: Error) => void): this;
  off(event: "connect", listener: () => void): this;
  off(event: "data", listener: (chunk: string) => void): this;
  off(event: "error", listener: (error: Error) => void): this;
  off(event: "close", listener: () => void): this;
  write(payload: string): boolean;
  end(): this;
  destroy(error?: Error): this;
}

export interface DaemonConnectionOptions {
  socketPath?: string;
  connectTimeoutMs?: number;
  requestTimeoutMs?: number;
  reconnectBackoffMs?: readonly number[];
  connect?: (socketPath: string) => DaemonSocket;
  requestIdFactory?: () => string;
}

interface PendingRequest {
  id: string;
  method: string;
  resolve: (result: DaemonConnectionResult<unknown>) => void;
  timeout: ReturnType<typeof setTimeout>;
}

interface ActiveConnection {
  socket: DaemonSocket;
  pending: Map<string, PendingRequest>;
  buffer: string;
  closed: boolean;
  dispose(): void;
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

interface ProtocolEventFrame {
  event: string;
  payload: unknown;
  ts?: string;
}

export function createDaemonConnection(options: DaemonConnectionOptions = {}): DaemonConnection {
  return new TuiDaemonConnection(options);
}

export function resolveTuiDaemonSocketPath(): string {
  const socketOverride = process.env.TODU_DAEMON_SOCKET;
  if (socketOverride && socketOverride.trim().length > 0) {
    return path.resolve(socketOverride);
  }

  const configPath = resolveConfigPath();
  const config = loadTuiFileConfig(configPath);
  const dataDir = resolveDataDir(configPath, config, { env: process.env });
  return path.join(dataDir, "daemon.sock");
}

function loadTuiFileConfig(configPath: string): ToduFileConfig {
  try {
    const content = fs.readFileSync(configPath, "utf-8");
    return normalizeConfigPaths((parse(content) as ToduFileConfig) ?? {}, configPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

class TuiDaemonConnection implements DaemonConnection {
  private readonly socketPath: string;
  private readonly connectTimeoutMs: number;
  private readonly requestTimeoutMs: number;
  private readonly reconnectBackoffMs: readonly number[];
  private readonly connect: (socketPath: string) => DaemonSocket;
  private readonly requestIdFactory: () => string;
  private readonly listeners = new Set<DaemonConnectionListener>();
  private readonly eventListeners = new Set<DaemonEventListener>();

  private running = false;
  private connecting = false;
  private hasConnectedOnce = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private activeConnection: ActiveConnection | null = null;
  private snapshot: DaemonConnectionSnapshot;

  constructor(options: DaemonConnectionOptions) {
    this.socketPath = options.socketPath ?? resolveTuiDaemonSocketPath();
    this.connectTimeoutMs = normalizeTimeout(
      options.connectTimeoutMs,
      DEFAULT_TUI_DAEMON_CONNECT_TIMEOUT_MS,
    );
    this.requestTimeoutMs = normalizeTimeout(
      options.requestTimeoutMs,
      DEFAULT_TUI_DAEMON_REQUEST_TIMEOUT_MS,
    );
    const backoff =
      options.reconnectBackoffMs && options.reconnectBackoffMs.length > 0
        ? options.reconnectBackoffMs
        : DEFAULT_TUI_RECONNECT_BACKOFF_MS;
    this.reconnectBackoffMs = backoff.map((value) => normalizeTimeout(value, 250));
    this.connect = options.connect ?? ((socketPath: string) => net.createConnection(socketPath));
    this.requestIdFactory = options.requestIdFactory ?? createRequestId;
    this.snapshot = {
      state: "disconnected",
      socketPath: this.socketPath,
      hello: null,
      error: null,
      reconnectAttempt: 0,
      reconnectDelayMs: null,
    };
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
        reason: { code: "DAEMON_UNAVAILABLE", message: "Daemon connection stopped" },
        shouldReconnect: false,
      });
    }

    this.setSnapshot({
      state: "disconnected",
      hello: null,
      error: null,
      reconnectAttempt: 0,
      reconnectDelayMs: null,
    });
  }

  getSnapshot(): DaemonConnectionSnapshot {
    return this.snapshot;
  }

  subscribe(listener: DaemonConnectionListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribeEvents(listener: DaemonEventListener): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  async request<T>(
    method: string,
    params: Record<string, unknown> = {},
    options?: { timeoutMs?: number },
  ): Promise<DaemonConnectionResult<T>> {
    return this.sendRequest<T>(
      method,
      params,
      normalizeTimeout(options?.timeoutMs, this.requestTimeoutMs),
    );
  }

  private async attemptConnect(): Promise<void> {
    if (!this.running || this.connecting || this.activeConnection) {
      return;
    }

    this.connecting = true;
    this.setSnapshot({
      state: this.hasConnectedOnce ? "reconnecting" : "connecting",
      error: null,
      reconnectDelayMs: null,
    });

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

    const active = this.createActiveConnection(socketResult.value);
    this.activeConnection = active;

    const helloResult = await this.sendRequest<DaemonHelloResult>(
      "daemon.hello",
      { protocolVersion: DAEMON_PROTOCOL_VERSION },
      this.requestTimeoutMs,
    );

    if (!helloResult.ok) {
      this.closeConnection(active, { reason: helloResult.error, shouldReconnect: true });
      return;
    }

    if (!isHelloResult(helloResult.value)) {
      this.closeConnection(active, {
        reason: {
          code: "BAD_RESPONSE",
          message: "Daemon hello response is missing expected protocol metadata",
        },
        shouldReconnect: true,
      });
      return;
    }

    this.hasConnectedOnce = true;
    this.reconnectAttempt = 0;
    this.setSnapshot({
      state: "connected",
      hello: helloResult.value,
      error: null,
      reconnectAttempt: 0,
      reconnectDelayMs: null,
    });
  }

  private createActiveConnection(socket: DaemonSocket): ActiveConnection {
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

        const parsed = parseJsonFrame(trimmed);
        if (!parsed.ok) {
          this.closeConnection(connection, { reason: parsed.error, shouldReconnect: true });
          return;
        }

        this.handleFrame(connection, parsed.value);
      }
    };

    const onError = (error: Error) => {
      this.closeConnection(connection, { reason: error, shouldReconnect: true });
    };

    const onClose = () => {
      this.closeConnection(connection, {
        reason: { code: "DAEMON_UNAVAILABLE", message: "Daemon connection closed" },
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
      this.closeConnection(connection, { reason: parsed.error, shouldReconnect: true });
      return;
    }

    if (parsed.kind === "event") {
      this.dispatchEvent(parsed.value);
      return;
    }

    const responseId = parsed.value.id;
    if (responseId === null) {
      return;
    }

    const pending = connection.pending.get(responseId);
    if (!pending) {
      return;
    }

    connection.pending.delete(responseId);
    clearTimeout(pending.timeout);

    if (parsed.kind === "error") {
      pending.resolve({ ok: false, error: parsed.value.error });
      return;
    }

    pending.resolve({ ok: true, value: parsed.value.result });
  }

  private dispatchEvent(event: DaemonEventFrame): void {
    for (const listener of this.eventListeners) {
      listener(event);
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
          details: { method: pending.method },
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

    this.setSnapshot({
      state: "disconnected",
      hello: null,
      error: toConnectionError(options.reason),
      reconnectDelayMs: null,
    });

    if (options.shouldReconnect) {
      this.scheduleReconnect(options.reason);
    }
  }

  private scheduleReconnect(reason: unknown): void {
    if (!this.running || this.reconnectTimer) {
      return;
    }

    const delayMs =
      this.reconnectBackoffMs[
        Math.min(this.reconnectAttempt, this.reconnectBackoffMs.length - 1)
      ] ?? 250;
    this.reconnectAttempt += 1;

    this.setSnapshot({
      state: this.hasConnectedOnce ? "reconnecting" : "failed",
      hello: null,
      error: toConnectionError(reason),
      reconnectAttempt: this.reconnectAttempt,
      reconnectDelayMs: delayMs,
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.attemptConnect();
    }, delayMs);
  }

  private sendRequest<T>(
    method: string,
    params: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<DaemonConnectionResult<T>> {
    const connection = this.activeConnection;
    if (!this.running || !connection || connection.closed) {
      return Promise.resolve({
        ok: false,
        error: {
          code: "DAEMON_UNAVAILABLE",
          message: "Daemon connection is not available",
          details: { method },
        },
      });
    }

    const id = this.requestIdFactory();
    const request: ProtocolRequestFrame = { id, method, params };

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        connection.pending.delete(id);
        resolve({
          ok: false,
          error: {
            code: "TIMEOUT",
            message: `Daemon request timed out after ${timeoutMs}ms`,
            details: { method, timeoutMs },
          },
        });
      }, timeoutMs);

      connection.pending.set(id, {
        id,
        method,
        resolve: resolve as (result: DaemonConnectionResult<unknown>) => void,
        timeout,
      });

      try {
        connection.socket.write(`${JSON.stringify(request)}\n`);
      } catch (error) {
        clearTimeout(timeout);
        connection.pending.delete(id);
        resolve({ ok: false, error: toConnectionError(error) });
      }
    });
  }

  private setSnapshot(update: Partial<DaemonConnectionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...update };
    for (const listener of this.listeners) {
      listener(this.snapshot);
    }
  }
}

async function connectSocket(
  socketPath: string,
  timeoutMs: number,
  connect: (socketPath: string) => DaemonSocket,
): Promise<DaemonConnectionResult<DaemonSocket>> {
  return new Promise((resolve) => {
    let settled = false;
    const socket = connect(socketPath);

    const cleanup = () => {
      socket.off("error", onError);
      socket.off("connect", onConnect);
    };

    const finish = (result: DaemonConnectionResult<DaemonSocket>) => {
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

    const onError = (error: Error) => {
      socket.destroy();
      finish({ ok: false, error: mapConnectError(socketPath, error) });
    };

    const timeout = setTimeout(() => {
      socket.destroy();
      finish({
        ok: false,
        error: {
          code: "DAEMON_UNAVAILABLE",
          message: `Timed out connecting to daemon socket after ${Math.floor(timeoutMs)}ms`,
          details: { socketPath, timeoutMs: Math.floor(timeoutMs) },
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
      details: { socketPath, reason: code },
    };
  }

  return {
    code: "INTERNAL_ERROR",
    message: getErrorMessage(source),
    details: { socketPath, reason: code },
  };
}

function parseJsonFrame(payload: string): DaemonConnectionResult<unknown> {
  try {
    return { ok: true, value: JSON.parse(payload) as unknown };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "BAD_RESPONSE",
        message: "Daemon returned invalid JSON frame",
        details: { parseError: getErrorMessage(error) },
      },
    };
  }
}

function parseIncomingFrame(
  frame: unknown,
):
  | { ok: true; kind: "success"; value: ProtocolSuccessFrame }
  | { ok: true; kind: "error"; value: ProtocolErrorFrame }
  | { ok: true; kind: "event"; value: ProtocolEventFrame }
  | { ok: false; error: DaemonConnectionError } {
  if (!isRecord(frame)) {
    return {
      ok: false,
      error: { code: "BAD_RESPONSE", message: "Daemon response frame must be an object" },
    };
  }

  if (typeof frame.event === "string") {
    return {
      ok: true,
      kind: "event",
      value: {
        event: frame.event,
        payload: frame.payload,
        ts: typeof frame.ts === "string" ? frame.ts : undefined,
      },
    };
  }

  if (isRecord(frame.error)) {
    const id = frame.id;
    const error = frame.error;
    if (
      (typeof id === "string" || id === null) &&
      typeof error.code === "string" &&
      typeof error.message === "string"
    ) {
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

  if (typeof frame.id === "string" && "result" in frame) {
    return { ok: true, kind: "success", value: { id: frame.id, result: frame.result } };
  }

  return {
    ok: false,
    error: { code: "BAD_RESPONSE", message: "Daemon response frame shape is invalid" },
  };
}

function isHelloResult(value: unknown): value is DaemonHelloResult {
  return isRecord(value) && value.protocolVersion === DAEMON_PROTOCOL_VERSION;
}

function toConnectionError(source: unknown): DaemonConnectionError {
  if (isConnectionError(source)) {
    return source;
  }

  return {
    code: errorCode(source) ?? "INTERNAL_ERROR",
    message: getErrorMessage(source),
  };
}

function isConnectionError(value: unknown): value is DaemonConnectionError {
  return isRecord(value) && typeof value.code === "string" && typeof value.message === "string";
}

function normalizeTimeout(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
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
  return `tui-${Date.now()}-${requestCounter}`;
}
