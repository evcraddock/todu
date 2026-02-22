import type { Socket } from "node:net";
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
export const DAEMON_CAPABILITY_METHODS = [
  "daemon.hello",
  "daemon.ping",
  "daemon.status",
  "events.subscribe",
  "events.unsubscribe",
];
export const DAEMON_CAPABILITY_EVENTS = ["data.changed", "sync.statusChanged"] as const;

export type DaemonCapabilityEvent = (typeof DAEMON_CAPABILITY_EVENTS)[number];

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

export interface DaemonRpcRouter {
  handleRequest(
    request: ProtocolRequestFrame,
    context: DaemonRpcContext,
    connection?: DaemonConnection,
  ): ProtocolSuccessFrame<unknown> | ProtocolErrorFrame;
  handlePayload(
    payload: string,
    context: DaemonRpcContext,
    connection?: DaemonConnection,
  ): ProtocolSuccessFrame<unknown> | ProtocolErrorFrame;
  createConnectionHandler(contextProvider: () => DaemonRpcContext): (socket: Socket) => void;
  dispatchEvent(event: DaemonCapabilityEvent, payload: unknown, ts?: string): number;
}

export function createDaemonRpcRouter(): DaemonRpcRouter {
  const connections = new Set<DaemonConnection>();

  return {
    handleRequest(
      request: ProtocolRequestFrame,
      context: DaemonRpcContext,
      connection?: DaemonConnection,
    ) {
      if (request.method === "daemon.hello") {
        return handleDaemonHello(request, context);
      }

      if (request.method === "daemon.ping") {
        return handleDaemonPing(request);
      }

      if (request.method === "daemon.status") {
        return handleDaemonStatus(request, context);
      }

      if (request.method === "events.subscribe") {
        return handleEventsSubscribe(request, connection);
      }

      if (request.method === "events.unsubscribe") {
        return handleEventsUnsubscribe(request, connection);
      }

      return createProtocolErrorFrame(
        request.id,
        createProtocolError("METHOD_NOT_FOUND", `Unknown method: ${request.method}`, {
          method: request.method,
        }),
      );
    },

    handlePayload(payload: string, context: DaemonRpcContext, connection?: DaemonConnection) {
      const parsed = parseProtocolRequestJson(payload);
      if (!parsed.ok) {
        return createProtocolErrorFrame(null, parsed.error);
      }

      return this.handleRequest(parsed.value, context, connection);
    },

    createConnectionHandler(contextProvider: () => DaemonRpcContext) {
      return (socket: Socket) => {
        let buffer = "";

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

            const response = this.handlePayload(trimmed, contextProvider(), connection);
            try {
              socket.write(`${JSON.stringify(response)}\n`);
            } catch {
              closeConnection();
            }
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
