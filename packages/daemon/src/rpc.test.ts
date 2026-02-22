import { describe, expect, it } from "vitest";
import { createDaemonRpcRouter, DAEMON_PROTOCOL_VERSION, DEFAULT_DAEMON_VERSION } from "./rpc.js";

describe("createDaemonRpcRouter", () => {
  const router = createDaemonRpcRouter();

  it("returns daemon.hello handshake payload with deterministic capabilities", () => {
    const response = router.handleRequest(
      {
        id: "1",
        method: "daemon.hello",
        params: {
          protocolVersion: DAEMON_PROTOCOL_VERSION,
        },
      },
      {
        daemonVersion: DEFAULT_DAEMON_VERSION,
        role: "authority",
        catalogId: "catalog-123",
      },
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
        methods: ["daemon.hello"],
        events: [],
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
      {
        daemonVersion: DEFAULT_DAEMON_VERSION,
        role: "node",
        catalogId: null,
      },
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
      {
        daemonVersion: DEFAULT_DAEMON_VERSION,
        role: "node",
        catalogId: null,
      },
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
      {
        daemonVersion: DEFAULT_DAEMON_VERSION,
        role: "node",
        catalogId: null,
      },
    );

    expect("error" in response).toBe(true);
    if (!("error" in response)) {
      throw new Error("Expected method not found error response");
    }

    expect(response.error.code).toBe("METHOD_NOT_FOUND");
  });

  it("maps invalid JSON payloads to BAD_REQUEST through handlePayload", () => {
    const response = router.handlePayload("{ invalid-json }", {
      daemonVersion: DEFAULT_DAEMON_VERSION,
      role: "node",
      catalogId: null,
    });

    expect("error" in response).toBe(true);
    if (!("error" in response)) {
      throw new Error("Expected bad request response");
    }

    expect(response.error.code).toBe("BAD_REQUEST");
  });
});
