import { describe, expect, it } from "vitest";
import {
  createDaemonRpcRouter,
  DAEMON_CAPABILITY_METHODS,
  DAEMON_PROTOCOL_VERSION,
  type DaemonRpcContext,
  DEFAULT_DAEMON_VERSION,
} from "./rpc.js";

describe("createDaemonRpcRouter", () => {
  const router = createDaemonRpcRouter();

  const context: DaemonRpcContext = {
    daemonVersion: DEFAULT_DAEMON_VERSION,
    role: "authority",
    catalogId: "catalog-123",
    runtimeState: "running",
    startedAt: "2026-02-22T23:00:00.000Z",
    transport: {
      kind: "uds",
      path: "/tmp/todu-daemon.sock",
      mode: 0o600,
    },
  };

  it("returns daemon.hello handshake payload with deterministic capabilities", () => {
    const response = router.handleRequest(
      {
        id: "1",
        method: "daemon.hello",
        params: {
          protocolVersion: DAEMON_PROTOCOL_VERSION,
        },
      },
      context,
    );

    expect("result" in response).toBe(true);
    if (!("result" in response)) {
      throw new Error("Expected handshake success response");
    }

    expect(response.result).toEqual({
      protocolVersion: DAEMON_PROTOCOL_VERSION,
      daemonVersion: DEFAULT_DAEMON_VERSION,
      role: "authority",
      capabilities: {
        methods: DAEMON_CAPABILITY_METHODS,
        events: [],
      },
      catalog: {
        id: "catalog-123",
      },
    });
  });

  it("returns daemon.ping healthy response", () => {
    const response = router.handleRequest(
      {
        id: "ping-1",
        method: "daemon.ping",
        params: {},
      },
      context,
    );

    expect("result" in response).toBe(true);
    if (!("result" in response)) {
      throw new Error("Expected ping success response");
    }

    expect(response.result).toMatchObject({
      ok: true,
    });

    expect(typeof response.result.ts).toBe("string");
    expect(Number.isNaN(Date.parse(response.result.ts))).toBe(false);
  });

  it("returns daemon.status baseline metadata", () => {
    const response = router.handleRequest(
      {
        id: "status-1",
        method: "daemon.status",
        params: {},
      },
      context,
    );

    expect("result" in response).toBe(true);
    if (!("result" in response)) {
      throw new Error("Expected status success response");
    }

    expect(response.result).toEqual({
      protocolVersion: DAEMON_PROTOCOL_VERSION,
      daemonVersion: DEFAULT_DAEMON_VERSION,
      role: "authority",
      state: "running",
      healthy: true,
      startedAt: "2026-02-22T23:00:00.000Z",
      transport: {
        kind: "uds",
        path: "/tmp/todu-daemon.sock",
        mode: 0o600,
      },
      catalog: {
        id: "catalog-123",
      },
    });
  });

  it("returns PROTOCOL_MISMATCH when handshake version differs", () => {
    const response = router.handleRequest(
      {
        id: "1",
        method: "daemon.hello",
        params: {
          protocolVersion: "999",
        },
      },
      context,
    );

    expect("error" in response).toBe(true);
    if (!("error" in response)) {
      throw new Error("Expected protocol mismatch error response");
    }

    expect(response.error.code).toBe("PROTOCOL_MISMATCH");
    expect(response.error.details).toEqual({
      expected: DAEMON_PROTOCOL_VERSION,
      received: "999",
    });
  });

  it("returns BAD_REQUEST when protocolVersion is missing", () => {
    const response = router.handleRequest(
      {
        id: "1",
        method: "daemon.hello",
        params: {},
      },
      context,
    );

    expect("error" in response).toBe(true);
    if (!("error" in response)) {
      throw new Error("Expected bad request error response");
    }

    expect(response.error.code).toBe("BAD_REQUEST");
    expect(response.error.message).toBe("daemon.hello requires params.protocolVersion string");
  });

  it("returns METHOD_NOT_FOUND for unknown methods", () => {
    const response = router.handleRequest(
      {
        id: "1",
        method: "unknown.method",
        params: {},
      },
      context,
    );

    expect("error" in response).toBe(true);
    if (!("error" in response)) {
      throw new Error("Expected method not found error response");
    }

    expect(response.error.code).toBe("METHOD_NOT_FOUND");
  });

  it("maps invalid JSON payloads to BAD_REQUEST through handlePayload", () => {
    const response = router.handlePayload("{ invalid-json }", context);

    expect("error" in response).toBe(true);
    if (!("error" in response)) {
      throw new Error("Expected bad request response");
    }

    expect(response.error.code).toBe("BAD_REQUEST");
  });
});
