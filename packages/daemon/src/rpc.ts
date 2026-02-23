import type { Socket } from "node:net";
import {
  createDaemonLogger,
  type DaemonLogger,
  type DaemonLogLevel,
  resolveDaemonLogLevelFromEnv,
} from "./logger.js";
import {
  createProtocolError,
  createProtocolErrorFrame,
  createProtocolEventFrame,
  createProtocolSuccessFrame,
  type ProtocolError,
  type ProtocolErrorFrame,
  type ProtocolRequestFrame,
  type ProtocolSuccessFrame,
  parseProtocolRequestJson,
} from "./protocol.js";

export const DAEMON_PROTOCOL_VERSION = "1";
export const DEFAULT_DAEMON_VERSION = "dev";
export const DEFAULT_DAEMON_REQUEST_TIMEOUT_MS = 30_000;
export const DAEMON_BASE_METHODS = [
  "daemon.hello",
  "daemon.ping",
  "daemon.status",
  "events.subscribe",
  "events.unsubscribe",
] as const;
export const DAEMON_CAPABILITY_EVENTS = ["data.changed", "sync.statusChanged"] as const;

export const CORE_DAEMON_NAMESPACE_METHODS = {
  project: ["create", "list", "get", "update", "delete"],
  task: ["create", "list", "get", "update", "delete", "move", "search"],
  label: ["create", "list", "update", "delete"],
  note: ["create", "list", "update", "delete"],
  recurring: [
    "create",
    "list",
    "get",
    "update",
    "delete",
    "pause",
    "resume",
    "upcoming",
    "generate",
    "process",
  ],
  habit: [
    "create",
    "list",
    "get",
    "update",
    "delete",
    "pause",
    "resume",
    "check",
    "uncheck",
    "streak",
    "history",
  ],
  sync: ["start", "stop", "status", "catalogId"],
} as const;

export const RESERVED_DAEMON_NAMESPACES = ["worker"] as const;

export const DAEMON_CAPABILITY_METHODS = [
  ...DAEMON_BASE_METHODS,
  ...listCoreNamespaceMethods(),
] as const;

export type DaemonCapabilityEvent = (typeof DAEMON_CAPABILITY_EVENTS)[number];
export type CoreDaemonNamespace = keyof typeof CORE_DAEMON_NAMESPACE_METHODS;
export type ReservedDaemonNamespace = (typeof RESERVED_DAEMON_NAMESPACES)[number];

export type DaemonRpcNamespace =
  | "daemon"
  | "events"
  | CoreDaemonNamespace
  | ReservedDaemonNamespace;
export type DaemonRpcNamespaceMethodTable = Record<string, DaemonRpcMethodHandler>;
export type DaemonRpcNamespaceHandlers = Partial<
  Record<DaemonRpcNamespace, DaemonRpcNamespaceMethodTable>
>;

export interface DaemonHelloResult {
  protocolVersion: string;
  daemonVersion: string;
  role: "node" | "authority";
  capabilities: {
    methods: string[];
    events: string[];
  };
  catalog: {
    id: string | null;
  };
}

export interface DaemonPingResult {
  ok: true;
  ts: string;
}

export interface DaemonStatusTransport {
  kind: "uds";
  path: string;
  mode: number;
}

export type DaemonRuntimeStateSnapshot = "stopped" | "starting" | "running" | "stopping";

export interface DaemonStatusResult {
  protocolVersion: string;
  daemonVersion: string;
  role: "node" | "authority";
  state: DaemonRuntimeStateSnapshot;
  healthy: boolean;
  startedAt: string | null;
  transport: DaemonStatusTransport | null;
  catalog: {
    id: string | null;
  };
}

export interface EventsSubscribeResult {
  subscribed: DaemonCapabilityEvent[];
}

export interface EventsUnsubscribeResult {
  unsubscribed: DaemonCapabilityEvent[];
}

export interface DaemonRpcContext {
  daemonVersion: string;
  role: "node" | "authority";
  catalogId: string | null;
  runtimeState: DaemonRuntimeStateSnapshot;
  startedAt: string | null;
  transport: DaemonStatusTransport | null;
}

interface DaemonConnection {
  socket: Socket;
  subscriptions: Set<DaemonCapabilityEvent>;
  closed: boolean;
}

export type DaemonRpcResponse = ProtocolSuccessFrame<unknown> | ProtocolErrorFrame;

export type DaemonRpcMethodHandler = (
  request: ProtocolRequestFrame,
  context: DaemonRpcContext,
  connection?: DaemonConnection,
) => DaemonRpcResponse | Promise<DaemonRpcResponse>;

export interface CreateDaemonRpcRouterOptions {
  methodHandlers?: Partial<Record<string, DaemonRpcMethodHandler>>;
  namespaceHandlers?: DaemonRpcNamespaceHandlers;
  logger?: DaemonLogger;
  logLevel?: DaemonLogLevel;
}

interface ConnectionHandlerOptions {
  requestTimeoutMs?: number;
}

export interface DaemonRpcRouter {
  handleRequest(
    request: ProtocolRequestFrame,
    context: DaemonRpcContext,
    connection?: DaemonConnection,
  ): Promise<DaemonRpcResponse>;
  handlePayload(
    payload: string,
    context: DaemonRpcContext,
    connection?: DaemonConnection,
  ): Promise<DaemonRpcResponse>;
  createConnectionHandler(
    contextProvider: () => DaemonRpcContext,
    options?: ConnectionHandlerOptions,
  ): (socket: Socket) => void;
  dispatchEvent(event: DaemonCapabilityEvent, payload: unknown, ts?: string): number;
}

export function createDaemonRpcRouter(options: CreateDaemonRpcRouterOptions = {}): DaemonRpcRouter {
  const connections = new Set<DaemonConnection>();
  const logger =
    options.logger ??
    createDaemonLogger({
      component: "daemon.rpc",
      level: options.logLevel ?? resolveDaemonLogLevelFromEnv(process.env),
    });

  const namespaceHandlers = mergeNamespaceHandlers(
    createDefaultNamespaceHandlers(),
    options.namespaceHandlers ?? {},
  );

  const methodHandlers: Record<string, DaemonRpcMethodHandler | undefined> = {
    ...(options.methodHandlers ?? {}),
  };

  async function runRequest(
    request: ProtocolRequestFrame,
    context: DaemonRpcContext,
    connection?: DaemonConnection,
  ): Promise<DaemonRpcResponse> {
    const requestStartedAt = Date.now();
    const requestContext = createRpcRequestContext(request);

    logger.debug("rpc request started", requestContext);

    const handler = resolveMethodHandler(request.method, namespaceHandlers, methodHandlers);

    let response: DaemonRpcResponse;

    if (!handler) {
      const parsedMethod = parseMethod(request.method);
      if (parsedMethod && isReservedDaemonNamespace(parsedMethod.namespace)) {
        response = createProtocolErrorFrame(
          request.id,
          createProtocolError(
            "UNSUPPORTED_CAPABILITY",
            `Namespace is reserved but not implemented: ${parsedMethod.namespace}`,
            {
              namespace: parsedMethod.namespace,
              method: request.method,
            },
          ),
        );
      } else {
        response = createProtocolErrorFrame(
          request.id,
          createProtocolError("METHOD_NOT_FOUND", `Unknown method: ${request.method}`, {
            method: request.method,
          }),
        );
      }
    } else {
      try {
        response = await handler(request, context, connection);
      } catch (error) {
        response = createProtocolErrorFrame(request.id, error);
      }
    }

    logRpcResponse(response, request, requestStartedAt);
    return response;
  }

  async function executeRequestWithTimeout(
    request: ProtocolRequestFrame,
    context: DaemonRpcContext,
    connection: DaemonConnection,
    requestTimeoutMs: number,
  ): Promise<DaemonRpcResponse> {
    return new Promise((resolve) => {
      let settled = false;

      const timeout = setTimeout(() => {
        if (settled) {
          return;
        }

        settled = true;
        resolve(
          createProtocolErrorFrame(
            request.id,
            createProtocolError("TIMEOUT", "Request execution timed out", {
              method: request.method,
              timeoutMs: requestTimeoutMs,
            }),
          ),
        );
      }, requestTimeoutMs);

      void runRequest(request, context, connection).then((response) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        resolve(response);
      });
    });
  }

  function createRpcRequestContext(request: ProtocolRequestFrame): Record<string, unknown> {
    const paramKeys = Object.keys(request.params).sort();

    return {
      requestId: request.id,
      method: request.method,
      paramCount: paramKeys.length,
      paramKeys,
    };
  }

  function logRpcResponse(
    response: DaemonRpcResponse,
    request: ProtocolRequestFrame,
    startedAt: number,
  ): void {
    const durationMs = Date.now() - startedAt;

    if ("result" in response) {
      logger.info("rpc request completed", {
        requestId: request.id,
        method: request.method,
        outcome: "success",
        durationMs,
      });
      return;
    }

    logger.info("rpc request completed", {
      requestId: request.id,
      method: request.method,
      outcome: "error",
      errorCode: response.error.code,
      durationMs,
    });

    logger.warn("rpc request failed", {
      requestId: request.id,
      method: request.method,
      errorCode: response.error.code,
    });

    logger.debug("rpc request failure details", {
      requestId: request.id,
      method: request.method,
      errorMessage: response.error.message,
      errorDetails: response.error.details,
    });
  }

  return {
    handleRequest(
      request: ProtocolRequestFrame,
      context: DaemonRpcContext,
      connection?: DaemonConnection,
    ) {
      return runRequest(request, context, connection);
    },

    async handlePayload(payload: string, context: DaemonRpcContext, connection?: DaemonConnection) {
      const parsed = parseProtocolRequestJson(payload);
      if (!parsed.ok) {
        logger.warn("rpc payload parse failed", {
          errorCode: parsed.error.code,
        });
        logger.debug("rpc payload parse details", {
          errorMessage: parsed.error.message,
          errorDetails: parsed.error.details,
        });

        return createProtocolErrorFrame(null, parsed.error);
      }

      return runRequest(parsed.value, context, connection);
    },

    createConnectionHandler(
      contextProvider: () => DaemonRpcContext,
      options: ConnectionHandlerOptions = {},
    ) {
      const requestTimeoutMs = normalizeRequestTimeoutMs(options.requestTimeoutMs);

      return (socket: Socket) => {
        let buffer = "";
        let pending = Promise.resolve();

        const connection: DaemonConnection = {
          socket,
          subscriptions: new Set(),
          closed: false,
        };

        const closeConnection = () => {
          if (connection.closed) {
            return;
          }

          connection.closed = true;
          connection.subscriptions.clear();
          connections.delete(connection);
        };

        const processLine = async (line: string) => {
          const parsed = parseProtocolRequestJson(line);

          let response: DaemonRpcResponse;
          if (!parsed.ok) {
            logger.warn("rpc request parse failed", {
              errorCode: parsed.error.code,
            });
            logger.debug("rpc request parse details", {
              errorMessage: parsed.error.message,
              errorDetails: parsed.error.details,
            });
            response = createProtocolErrorFrame(null, parsed.error);
          } else {
            response = await executeRequestWithTimeout(
              parsed.value,
              contextProvider(),
              connection,
              requestTimeoutMs,
            );
          }

          if (connection.closed) {
            return;
          }

          try {
            socket.write(`${JSON.stringify(response)}\n`);
          } catch {
            logger.warn("rpc response write failed", {
              requestId: parsed.ok ? parsed.value.id : null,
              method: parsed.ok ? parsed.value.method : "unknown",
            });
            closeConnection();
          }
        };

        connections.add(connection);

        socket.setEncoding("utf8");
        socket.on("error", closeConnection);
        socket.on("close", closeConnection);
        socket.on("end", closeConnection);

        socket.on("data", (chunk: string) => {
          buffer += chunk;

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.length === 0) {
              continue;
            }

            pending = pending
              .then(() => processLine(trimmed))
              .catch(() => {
                closeConnection();
              });
          }
        });
      };
    },

    dispatchEvent(
      event: DaemonCapabilityEvent,
      payload: unknown,
      ts: string = new Date().toISOString(),
    ): number {
      const frame = createProtocolEventFrame(event, payload, ts);
      let delivered = 0;

      for (const connection of connections) {
        if (connection.closed) {
          connections.delete(connection);
          continue;
        }

        if (!connection.subscriptions.has(event)) {
          continue;
        }

        try {
          connection.socket.write(`${JSON.stringify(frame)}\n`);
          delivered++;
        } catch {
          connection.closed = true;
          connection.subscriptions.clear();
          connections.delete(connection);
        }
      }

      return delivered;
    },
  };
}

function listCoreNamespaceMethods(): string[] {
  const methods: string[] = [];

  const namespaces = Object.keys(CORE_DAEMON_NAMESPACE_METHODS).sort() as CoreDaemonNamespace[];
  for (const namespace of namespaces) {
    for (const methodName of CORE_DAEMON_NAMESPACE_METHODS[namespace]) {
      methods.push(`${namespace}.${methodName}`);
    }
  }

  return methods;
}

function createDefaultNamespaceHandlers(): DaemonRpcNamespaceHandlers {
  return {
    daemon: {
      hello: (request, context) => handleDaemonHello(request, context),
      ping: (request) => handleDaemonPing(request),
      status: (request, context) => handleDaemonStatus(request, context),
    },
    events: {
      subscribe: (request, _context, connection) => handleEventsSubscribe(request, connection),
      unsubscribe: (request, _context, connection) => handleEventsUnsubscribe(request, connection),
    },
    ...createCoreNamespaceFallbackHandlers(),
  };
}

function createCoreNamespaceFallbackHandlers(): DaemonRpcNamespaceHandlers {
  const handlers: DaemonRpcNamespaceHandlers = {};

  const namespaces = Object.entries(CORE_DAEMON_NAMESPACE_METHODS) as Array<
    [CoreDaemonNamespace, readonly string[]]
  >;

  for (const [namespace, methods] of namespaces) {
    const methodHandlers: DaemonRpcNamespaceMethodTable = {};

    for (const method of methods) {
      methodHandlers[method] = createUnsupportedCapabilityHandler(namespace, method);
    }

    handlers[namespace] = methodHandlers;
  }

  return handlers;
}

function createUnsupportedCapabilityHandler(
  namespace: CoreDaemonNamespace,
  methodName: string,
): DaemonRpcMethodHandler {
  const fullMethod = `${namespace}.${methodName}`;

  return (request) =>
    createProtocolErrorFrame(
      request.id,
      createProtocolError(
        "UNSUPPORTED_CAPABILITY",
        `Method is not implemented: ${request.method}`,
        {
          namespace,
          method: request.method,
          capability: fullMethod,
        },
      ),
    );
}

function mergeNamespaceHandlers(
  base: DaemonRpcNamespaceHandlers,
  overrides: DaemonRpcNamespaceHandlers,
): DaemonRpcNamespaceHandlers {
  const merged: DaemonRpcNamespaceHandlers = {};

  const namespaces = new Set<DaemonRpcNamespace>([
    ...(Object.keys(base) as DaemonRpcNamespace[]),
    ...(Object.keys(overrides) as DaemonRpcNamespace[]),
  ]);

  for (const namespace of namespaces) {
    merged[namespace] = {
      ...(base[namespace] ?? {}),
      ...(overrides[namespace] ?? {}),
    };
  }

  return merged;
}

function resolveMethodHandler(
  method: string,
  namespaceHandlers: DaemonRpcNamespaceHandlers,
  methodHandlers: Record<string, DaemonRpcMethodHandler | undefined>,
): DaemonRpcMethodHandler | undefined {
  const directHandler = methodHandlers[method];
  if (directHandler) {
    return directHandler;
  }

  const parsed = parseMethod(method);
  if (!parsed) {
    return undefined;
  }

  return namespaceHandlers[parsed.namespace]?.[parsed.methodName];
}

function parseMethod(
  value: string,
): { namespace: DaemonRpcNamespace; methodName: string } | undefined {
  const separatorIndex = value.indexOf(".");

  if (separatorIndex <= 0 || separatorIndex >= value.length - 1) {
    return undefined;
  }

  const namespace = value.slice(0, separatorIndex);
  const methodName = value.slice(separatorIndex + 1);

  if (!isDaemonRpcNamespace(namespace)) {
    return undefined;
  }

  return {
    namespace,
    methodName,
  };
}

function isDaemonRpcNamespace(value: string): value is DaemonRpcNamespace {
  if (value === "daemon" || value === "events") {
    return true;
  }

  if (isReservedDaemonNamespace(value)) {
    return true;
  }

  return value in CORE_DAEMON_NAMESPACE_METHODS;
}

function isReservedDaemonNamespace(value: string): value is ReservedDaemonNamespace {
  return (RESERVED_DAEMON_NAMESPACES as readonly string[]).includes(value);
}

function handleDaemonHello(
  request: ProtocolRequestFrame,
  context: DaemonRpcContext,
): ProtocolSuccessFrame<DaemonHelloResult> | ProtocolErrorFrame {
  const protocolVersion = request.params.protocolVersion;

  if (typeof protocolVersion !== "string" || protocolVersion.trim().length === 0) {
    return createProtocolErrorFrame(
      request.id,
      createProtocolError("BAD_REQUEST", "daemon.hello requires params.protocolVersion string", {
        field: "protocolVersion",
      }),
    );
  }

  if (protocolVersion !== DAEMON_PROTOCOL_VERSION) {
    return createProtocolErrorFrame(
      request.id,
      createProtocolError("PROTOCOL_MISMATCH", "Protocol version mismatch", {
        expected: DAEMON_PROTOCOL_VERSION,
        received: protocolVersion,
      }),
    );
  }

  return createProtocolSuccessFrame(request.id, {
    protocolVersion: DAEMON_PROTOCOL_VERSION,
    daemonVersion: context.daemonVersion,
    role: context.role,
    capabilities: {
      methods: DAEMON_CAPABILITY_METHODS.slice(),
      events: [...DAEMON_CAPABILITY_EVENTS],
    },
    catalog: {
      id: context.catalogId,
    },
  });
}

function handleDaemonPing(request: ProtocolRequestFrame): ProtocolSuccessFrame<DaemonPingResult> {
  return createProtocolSuccessFrame(request.id, {
    ok: true,
    ts: new Date().toISOString(),
  });
}

function handleDaemonStatus(
  request: ProtocolRequestFrame,
  context: DaemonRpcContext,
): ProtocolSuccessFrame<DaemonStatusResult> {
  return createProtocolSuccessFrame(request.id, {
    protocolVersion: DAEMON_PROTOCOL_VERSION,
    daemonVersion: context.daemonVersion,
    role: context.role,
    state: context.runtimeState,
    healthy: context.runtimeState === "running",
    startedAt: context.startedAt,
    transport: context.transport,
    catalog: {
      id: context.catalogId,
    },
  });
}

function handleEventsSubscribe(
  request: ProtocolRequestFrame,
  connection?: DaemonConnection,
): ProtocolSuccessFrame<EventsSubscribeResult> | ProtocolErrorFrame {
  if (!connection || connection.closed) {
    return createProtocolErrorFrame(
      request.id,
      createProtocolError("INTERNAL_ERROR", "events.subscribe requires active connection context"),
    );
  }

  const parsed = parseRequestedEvents(request);
  if (!parsed.ok) {
    return createProtocolErrorFrame(request.id, parsed.error);
  }

  for (const event of parsed.events) {
    connection.subscriptions.add(event);
  }

  return createProtocolSuccessFrame(request.id, {
    subscribed: parsed.events,
  });
}

function handleEventsUnsubscribe(
  request: ProtocolRequestFrame,
  connection?: DaemonConnection,
): ProtocolSuccessFrame<EventsUnsubscribeResult> | ProtocolErrorFrame {
  if (!connection || connection.closed) {
    return createProtocolErrorFrame(
      request.id,
      createProtocolError(
        "INTERNAL_ERROR",
        "events.unsubscribe requires active connection context",
      ),
    );
  }

  const parsed = parseRequestedEvents(request);
  if (!parsed.ok) {
    return createProtocolErrorFrame(request.id, parsed.error);
  }

  const unsubscribed: DaemonCapabilityEvent[] = [];
  for (const event of parsed.events) {
    if (connection.subscriptions.delete(event)) {
      unsubscribed.push(event);
    }
  }

  return createProtocolSuccessFrame(request.id, {
    unsubscribed,
  });
}

function parseRequestedEvents(
  request: ProtocolRequestFrame,
): { ok: true; events: DaemonCapabilityEvent[] } | { ok: false; error: ProtocolError } {
  const eventsValue = request.params.events;

  if (!Array.isArray(eventsValue) || eventsValue.length === 0) {
    return {
      ok: false,
      error: createProtocolError(
        "BAD_REQUEST",
        `${request.method} requires params.events as a non-empty string array`,
        { field: "events" },
      ),
    };
  }

  const normalized: string[] = [];
  for (const event of eventsValue) {
    if (typeof event !== "string" || event.trim().length === 0) {
      return {
        ok: false,
        error: createProtocolError(
          "BAD_REQUEST",
          `${request.method} requires params.events as a non-empty string array`,
          { field: "events" },
        ),
      };
    }

    normalized.push(event.trim());
  }

  const uniqueEvents = [...new Set(normalized)];
  const unsupported = uniqueEvents.filter((event) => !isDaemonCapabilityEvent(event));

  if (unsupported.length > 0) {
    return {
      ok: false,
      error: createProtocolError(
        "UNSUPPORTED_CAPABILITY",
        "Unsupported event subscriptions requested",
        {
          unsupported,
          supported: [...DAEMON_CAPABILITY_EVENTS],
        },
      ),
    };
  }

  return {
    ok: true,
    events: uniqueEvents as DaemonCapabilityEvent[],
  };
}

function isDaemonCapabilityEvent(value: string): value is DaemonCapabilityEvent {
  return (DAEMON_CAPABILITY_EVENTS as readonly string[]).includes(value);
}

function normalizeRequestTimeoutMs(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_DAEMON_REQUEST_TIMEOUT_MS;
  }

  if (value < 1) {
    return DEFAULT_DAEMON_REQUEST_TIMEOUT_MS;
  }

  return Math.floor(value);
}
