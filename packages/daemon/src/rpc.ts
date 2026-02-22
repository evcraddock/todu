import type { Socket } from "node:net";
import {
  createProtocolError,
  createProtocolErrorFrame,
  createProtocolSuccessFrame,
  type ProtocolErrorFrame,
  type ProtocolRequestFrame,
  type ProtocolSuccessFrame,
  parseProtocolRequestJson,
} from "./protocol.js";

export const DAEMON_PROTOCOL_VERSION = "1";
export const DEFAULT_DAEMON_VERSION = "dev";
export const DAEMON_CAPABILITY_METHODS = ["daemon.hello", "daemon.ping", "daemon.status"];

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

export interface DaemonRpcContext {
  daemonVersion: string;
  role: "node" | "authority";
  catalogId: string | null;
  runtimeState: DaemonRuntimeStateSnapshot;
  startedAt: string | null;
  transport: DaemonStatusTransport | null;
}

export interface DaemonRpcRouter {
  handleRequest(
    request: ProtocolRequestFrame,
    context: DaemonRpcContext,
  ): ProtocolSuccessFrame<unknown> | ProtocolErrorFrame;
  handlePayload(
    payload: string,
    context: DaemonRpcContext,
  ): ProtocolSuccessFrame<unknown> | ProtocolErrorFrame;
  createConnectionHandler(contextProvider: () => DaemonRpcContext): (socket: Socket) => void;
}

export function createDaemonRpcRouter(): DaemonRpcRouter {
  return {
    handleRequest(request: ProtocolRequestFrame, context: DaemonRpcContext) {
      if (request.method === "daemon.hello") {
        return handleDaemonHello(request, context);
      }

      if (request.method === "daemon.ping") {
        return handleDaemonPing(request);
      }

      if (request.method === "daemon.status") {
        return handleDaemonStatus(request, context);
      }

      return createProtocolErrorFrame(
        request.id,
        createProtocolError("METHOD_NOT_FOUND", `Unknown method: ${request.method}`, {
          method: request.method,
        }),
      );
    },

    handlePayload(payload: string, context: DaemonRpcContext) {
      const parsed = parseProtocolRequestJson(payload);
      if (!parsed.ok) {
        return createProtocolErrorFrame(null, parsed.error);
      }

      return this.handleRequest(parsed.value, context);
    },

    createConnectionHandler(contextProvider: () => DaemonRpcContext) {
      return (socket: Socket) => {
        let buffer = "";

        socket.setEncoding("utf8");
        socket.on("error", () => {
          // avoid unhandled socket errors from disconnected clients
        });

        socket.on("data", (chunk: string) => {
          buffer += chunk;

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.length === 0) {
              continue;
            }

            const response = this.handlePayload(trimmed, contextProvider());
            socket.write(`${JSON.stringify(response)}\n`);
          }
        });
      };
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
      events: [],
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
