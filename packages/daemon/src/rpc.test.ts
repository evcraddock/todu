import fs from "node:fs";
import net, { type Socket } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProtocolSuccessFrame } from "./protocol.js";
import {
  createDaemonRpcRouter,
  DAEMON_CAPABILITY_EVENTS,
  DAEMON_CAPABILITY_METHODS,
  DAEMON_PROTOCOL_VERSION,
  type DaemonRpcContext,
  DEFAULT_DAEMON_VERSION,
} from "./rpc.js";

describe("createDaemonRpcRouter", () => {
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

  it("returns daemon.hello handshake payload with deterministic capabilities", async () => {
    const router = createDaemonRpcRouter();

    const response = await router.handleRequest(
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
        events: [...DAEMON_CAPABILITY_EVENTS],
      },
      catalog: {
        id: "catalog-123",
      },
    });
  });

  it("returns daemon.ping healthy response", async () => {
    const router = createDaemonRpcRouter();

    const response = await router.handleRequest(
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

  it("returns daemon.status baseline metadata", async () => {
    const router = createDaemonRpcRouter();

    const response = await router.handleRequest(
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

  it("returns PROTOCOL_MISMATCH when handshake version differs", async () => {
    const router = createDaemonRpcRouter();

    const response = await router.handleRequest(
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

  it("returns BAD_REQUEST when protocolVersion is missing", async () => {
    const router = createDaemonRpcRouter();

    const response = await router.handleRequest(
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

  it("returns METHOD_NOT_FOUND for unknown methods", async () => {
    const router = createDaemonRpcRouter();

    const response = await router.handleRequest(
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

  it("routes known core namespace methods through namespace handlers", async () => {
    const router = createDaemonRpcRouter({
      namespaceHandlers: {
        project: {
          list: (request) =>
            createProtocolSuccessFrame(request.id, {
              source: "project.list",
            }),
        },
      },
    });

    const response = await router.handleRequest(
      {
        id: "project-list-1",
        method: "project.list",
        params: {},
      },
      context,
    );

    expect(response).toEqual({
      id: "project-list-1",
      result: {
        source: "project.list",
      },
    });
  });

  it("returns UNSUPPORTED_CAPABILITY for known core methods without adapters", async () => {
    const router = createDaemonRpcRouter();

    const response = await router.handleRequest(
      {
        id: "project-list-unsupported",
        method: "project.list",
        params: {},
      },
      context,
    );

    expect("error" in response).toBe(true);
    if (!("error" in response)) {
      throw new Error("Expected unsupported capability error response");
    }

    expect(response.error).toEqual({
      code: "UNSUPPORTED_CAPABILITY",
      message: "Method is not implemented: project.list",
      details: {
        namespace: "project",
        method: "project.list",
        capability: "project.list",
      },
    });
  });

  it("returns UNSUPPORTED_CAPABILITY for reserved worker namespace methods", async () => {
    const router = createDaemonRpcRouter();

    const response = await router.handleRequest(
      {
        id: "worker-status-1",
        method: "worker.status",
        params: {},
      },
      context,
    );

    expect("error" in response).toBe(true);
    if (!("error" in response)) {
      throw new Error("Expected unsupported capability response");
    }

    expect(response.error).toEqual({
      code: "UNSUPPORTED_CAPABILITY",
      message: "Namespace is reserved but not implemented: worker",
      details: {
        namespace: "worker",
        method: "worker.status",
      },
    });
  });

  it("maps invalid JSON payloads to BAD_REQUEST through handlePayload", async () => {
    const router = createDaemonRpcRouter();

    const response = await router.handlePayload("{ invalid-json }", context);

    expect("error" in response).toBe(true);
    if (!("error" in response)) {
      throw new Error("Expected bad request response");
    }

    expect(response.error.code).toBe("BAD_REQUEST");
  });
});

describe("events.subscribe/events.unsubscribe dispatch", () => {
  let tmpDir: string;
  let socketPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-daemon-rpc-test-"));
    socketPath = path.join(tmpDir, "daemon.sock");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("tracks subscriptions per connection and dispatches best-effort event frames", async () => {
    const router = createDaemonRpcRouter();

    const context: DaemonRpcContext = {
      daemonVersion: DEFAULT_DAEMON_VERSION,
      role: "node",
      catalogId: "catalog-123",
      runtimeState: "running",
      startedAt: "2026-02-22T23:00:00.000Z",
      transport: {
        kind: "uds",
        path: socketPath,
        mode: 0o600,
      },
    };

    const server = net.createServer(router.createConnectionHandler(() => context));
    await listenServer(server, socketPath);

    const client = net.createConnection(socketPath);
    client.setEncoding("utf8");

    await waitForConnect(client);
    const nextFrame = createJsonLineReader(client);

    client.write(
      `${JSON.stringify({
        id: "sub-1",
        method: "events.subscribe",
        params: { events: ["data.changed"] },
      })}\n`,
    );

    const subscribeResponse = await nextFrame();
    expect(subscribeResponse).toEqual({
      id: "sub-1",
      result: {
        subscribed: ["data.changed"],
      },
    });

    const delivered = router.dispatchEvent(
      "data.changed",
      { scope: "task" },
      "2026-02-22T00:00:00.000Z",
    );
    expect(delivered).toBe(1);

    const eventFrame = await nextFrame();
    expect(eventFrame).toEqual({
      event: "data.changed",
      payload: { scope: "task" },
      ts: "2026-02-22T00:00:00.000Z",
    });

    client.write(
      `${JSON.stringify({
        id: "unsub-1",
        method: "events.unsubscribe",
        params: { events: ["data.changed"] },
      })}\n`,
    );

    const unsubscribeResponse = await nextFrame();
    expect(unsubscribeResponse).toEqual({
      id: "unsub-1",
      result: {
        unsubscribed: ["data.changed"],
      },
    });

    const deliveredAfterUnsubscribe = router.dispatchEvent("data.changed", {
      scope: "task",
      after: true,
    });
    expect(deliveredAfterUnsubscribe).toBe(0);

    await expect(nextFrame(150)).rejects.toThrow("Timed out waiting for frame");

    client.end();
    await closeServer(server);
  });

  it("returns UNSUPPORTED_CAPABILITY for unsupported event names", async () => {
    const router = createDaemonRpcRouter();

    const context: DaemonRpcContext = {
      daemonVersion: DEFAULT_DAEMON_VERSION,
      role: "node",
      catalogId: null,
      runtimeState: "running",
      startedAt: "2026-02-22T23:00:00.000Z",
      transport: {
        kind: "uds",
        path: socketPath,
        mode: 0o600,
      },
    };

    const server = net.createServer(router.createConnectionHandler(() => context));
    await listenServer(server, socketPath);

    const client = net.createConnection(socketPath);
    client.setEncoding("utf8");

    await waitForConnect(client);
    const nextFrame = createJsonLineReader(client);

    client.write(
      `${JSON.stringify({
        id: "sub-1",
        method: "events.subscribe",
        params: { events: ["unsupported.event"] },
      })}\n`,
    );

    const response = await nextFrame();
    expect(response.id).toBe("sub-1");
    expect(response.error?.code).toBe("UNSUPPORTED_CAPABILITY");
    expect(response.error?.details).toEqual({
      unsupported: ["unsupported.event"],
      supported: [...DAEMON_CAPABILITY_EVENTS],
    });

    client.end();
    await closeServer(server);
  });

  it("returns TIMEOUT and keeps connection healthy for subsequent requests", async () => {
    const router = createDaemonRpcRouter({
      methodHandlers: {
        "daemon.ping": async (request) => {
          await new Promise((resolve) => setTimeout(resolve, 60));
          return createProtocolSuccessFrame(request.id, {
            ok: true,
            ts: "late",
          });
        },
      },
    });

    const context: DaemonRpcContext = {
      daemonVersion: DEFAULT_DAEMON_VERSION,
      role: "node",
      catalogId: null,
      runtimeState: "running",
      startedAt: "2026-02-22T23:00:00.000Z",
      transport: {
        kind: "uds",
        path: socketPath,
        mode: 0o600,
      },
    };

    const server = net.createServer(
      router.createConnectionHandler(() => context, {
        requestTimeoutMs: 10,
      }),
    );
    await listenServer(server, socketPath);

    const client = net.createConnection(socketPath);
    client.setEncoding("utf8");

    await waitForConnect(client);
    const nextFrame = createJsonLineReader(client);

    client.write(
      `${JSON.stringify({
        id: "ping-1",
        method: "daemon.ping",
        params: {},
      })}\n`,
    );

    const timeoutResponse = await nextFrame();
    expect(timeoutResponse.id).toBe("ping-1");
    expect(timeoutResponse.error).toMatchObject({
      code: "TIMEOUT",
      message: "Request execution timed out",
      details: {
        method: "daemon.ping",
        timeoutMs: 10,
      },
    });

    client.write(
      `${JSON.stringify({
        id: "status-1",
        method: "daemon.status",
        params: {},
      })}\n`,
    );

    const statusResponse = await nextFrame();
    expect(statusResponse.id).toBe("status-1");
    expect(statusResponse.result).toMatchObject({
      state: "running",
      healthy: true,
    });

    client.end();
    await closeServer(server);
  });
});

function listenServer(server: net.Server, socketPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function waitForConnect(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.once("connect", () => {
      socket.off("error", reject);
      resolve();
    });
  });
}

function createJsonLineReader(
  client: Socket,
): (timeoutMs?: number) => Promise<Record<string, unknown>> {
  let buffer = "";
  const queuedLines: string[] = [];
  const waiters: Array<(line: string) => void> = [];

  client.on("data", (chunk: string) => {
    buffer += chunk;

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        continue;
      }

      const waiter = waiters.shift();
      if (waiter) {
        waiter(trimmed);
      } else {
        queuedLines.push(trimmed);
      }
    }
  });

  return async (timeoutMs: number = 1000): Promise<Record<string, unknown>> => {
    if (queuedLines.length > 0) {
      return JSON.parse(queuedLines.shift() ?? "{}");
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = waiters.indexOf(onLine);
        if (index >= 0) {
          waiters.splice(index, 1);
        }

        reject(new Error("Timed out waiting for frame"));
      }, timeoutMs);

      const onLine = (line: string) => {
        clearTimeout(timeout);
        resolve(JSON.parse(line) as Record<string, unknown>);
      };

      waiters.push(onLine);
    });
  };
}

function closeServer(server: net.Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}
