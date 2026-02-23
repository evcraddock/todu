import fs from "node:fs";
import net, { type Socket } from "node:net";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DAEMON_PROTOCOL_VERSION, type DaemonRpcMethodHandler } from "./rpc.js";
import { createDaemonRuntime } from "./runtime.js";

describe("daemon protocol conformance suite", () => {
  it("returns protocol success envelope shape for daemon.status", async () => {
    await withRunningRuntime({}, async (runtime) => {
      const response = await sendRequest(runtime.config().socketPath, {
        id: "status-envelope",
        method: "daemon.status",
        params: {},
      });

      expect(Object.keys(response).sort()).toEqual(["id", "result"]);
      expect(response.id).toBe("status-envelope");
      expect(response.result).toMatchObject({
        protocolVersion: DAEMON_PROTOCOL_VERSION,
        state: "running",
        healthy: true,
      });
    });
  });

  it("returns protocol success envelope for daemon.hello handshake", async () => {
    await withRunningRuntime({ daemonVersion: "9.9.9" }, async (runtime) => {
      const response = await sendRequest(runtime.config().socketPath, {
        id: "hello-ok",
        method: "daemon.hello",
        params: {
          protocolVersion: DAEMON_PROTOCOL_VERSION,
        },
      });

      expect(response.id).toBe("hello-ok");
      expect(response.result).toMatchObject({
        protocolVersion: DAEMON_PROTOCOL_VERSION,
        daemonVersion: "9.9.9",
      });
    });
  });

  it("returns PROTOCOL_MISMATCH for daemon.hello version mismatch", async () => {
    await withRunningRuntime({}, async (runtime) => {
      const response = await sendRequest(runtime.config().socketPath, {
        id: "hello-mismatch",
        method: "daemon.hello",
        params: {
          protocolVersion: "999",
        },
      });

      expect(Object.keys(response).sort()).toEqual(["error", "id"]);
      expect(response.id).toBe("hello-mismatch");
      expect(response.error).toEqual({
        code: "PROTOCOL_MISMATCH",
        message: "Protocol version mismatch",
        details: {
          expected: DAEMON_PROTOCOL_VERSION,
          received: "999",
        },
      });
    });
  });

  it("returns stable daemon.ping and daemon.status behavior", async () => {
    await withRunningRuntime({}, async (runtime) => {
      const ping = await sendRequest(runtime.config().socketPath, {
        id: "ping-stable",
        method: "daemon.ping",
        params: {},
      });

      expect(ping.id).toBe("ping-stable");
      expect(ping.result).toMatchObject({
        ok: true,
      });

      if (!ping.result || typeof ping.result !== "object") {
        throw new Error("Expected ping result object");
      }

      const pingTs = (ping.result as { ts?: unknown }).ts;
      expect(typeof pingTs).toBe("string");
      expect(Number.isNaN(Date.parse(pingTs as string))).toBe(false);

      const status = await sendRequest(runtime.config().socketPath, {
        id: "status-stable",
        method: "daemon.status",
        params: {},
      });

      expect(status.id).toBe("status-stable");
      expect(status.result).toMatchObject({
        protocolVersion: DAEMON_PROTOCOL_VERSION,
        state: "running",
        healthy: true,
      });
    });
  });

  it("supports baseline events.subscribe and events.unsubscribe methods", async () => {
    await withRunningRuntime({}, async (runtime) => {
      const client = await connectJsonLineClient(runtime.config().socketPath);

      client.send({
        id: "sub-baseline",
        method: "events.subscribe",
        params: {
          events: ["data.changed"],
        },
      });

      const subscribeResponse = await client.nextFrame();
      expect(subscribeResponse).toEqual({
        id: "sub-baseline",
        result: {
          subscribed: ["data.changed"],
        },
      });

      client.send({
        id: "unsub-baseline",
        method: "events.unsubscribe",
        params: {
          events: ["data.changed"],
        },
      });

      const unsubscribeResponse = await client.nextFrame();
      expect(unsubscribeResponse).toEqual({
        id: "unsub-baseline",
        result: {
          unsubscribed: ["data.changed"],
        },
      });

      await client.close();
    });
  });

  it("maps malformed request payloads to BAD_REQUEST protocol errors", async () => {
    await withRunningRuntime({}, async (runtime) => {
      const invalidJsonResponse = await sendRawPayload(
        runtime.config().socketPath,
        "{ invalid-json }\n",
      );

      expect(invalidJsonResponse).toMatchObject({
        id: null,
        error: {
          code: "BAD_REQUEST",
        },
      });

      const invalidFrameResponse = await sendRequest(runtime.config().socketPath, {
        id: "",
        method: "daemon.status",
        params: {},
      });

      expect(invalidFrameResponse).toMatchObject({
        id: null,
        error: {
          code: "BAD_REQUEST",
        },
      });
    });
  });

  it("maps long-running requests to TIMEOUT and keeps daemon healthy", async () => {
    const slowPingHandler: DaemonRpcMethodHandler = async (request) => {
      await new Promise((resolve) => setTimeout(resolve, 60));
      return {
        id: request.id,
        result: {
          ok: true,
          ts: "late",
        },
      };
    };

    await withRunningRuntime(
      {
        requestTimeoutMs: 10,
        rpcMethodHandlers: {
          "daemon.ping": slowPingHandler,
        },
      },
      async (runtime) => {
        const timeoutResponse = await sendRequest(runtime.config().socketPath, {
          id: "ping-timeout",
          method: "daemon.ping",
          params: {},
        });

        expect(timeoutResponse).toEqual({
          id: "ping-timeout",
          error: {
            code: "TIMEOUT",
            message: "Request execution timed out",
            details: {
              method: "daemon.ping",
              timeoutMs: 10,
            },
          },
        });

        const healthyResponse = await sendRequest(runtime.config().socketPath, {
          id: "status-after-timeout",
          method: "daemon.status",
          params: {},
        });

        expect(healthyResponse.id).toBe("status-after-timeout");
        expect(healthyResponse.result).toMatchObject({
          state: "running",
          healthy: true,
        });
      },
    );
  });
});

interface RuntimeHarnessConfig {
  daemonVersion?: string;
  requestTimeoutMs?: number;
  rpcMethodHandlers?: Record<string, DaemonRpcMethodHandler>;
}

async function withRunningRuntime(
  config: RuntimeHarnessConfig,
  run: (runtime: ReturnType<typeof createDaemonRuntime>) => Promise<void>,
): Promise<void> {
  const storagePath = fs.mkdtempSync(path.join(os.tmpdir(), "todu-daemon-conformance-"));
  const runtime = createDaemonRuntime({
    storagePath,
    daemonVersion: config.daemonVersion,
    requestTimeoutMs: config.requestTimeoutMs,
    rpcMethodHandlers: config.rpcMethodHandlers,
  });

  try {
    await runtime.start();
    await run(runtime);
  } finally {
    await runtime.stop();
    fs.rmSync(storagePath, { recursive: true, force: true });
  }
}

function sendRequest(
  socketPath: string,
  request: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return sendRawPayload(socketPath, `${JSON.stringify(request)}\n`);
}

function sendRawPayload(socketPath: string, payload: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(socketPath);

    let buffer = "";

    client.setEncoding("utf8");

    client.once("error", reject);

    client.once("connect", () => {
      client.write(payload);
    });

    client.on("data", (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      if (lines.length === 0) {
        return;
      }

      const first = lines[0];
      if (!first) {
        return;
      }

      try {
        resolve(JSON.parse(first) as Record<string, unknown>);
        client.end();
      } catch (error) {
        reject(error);
      }
    });
  });
}

interface JsonLineClient {
  send(frame: Record<string, unknown>): void;
  nextFrame(timeoutMs?: number): Promise<Record<string, unknown>>;
  close(): Promise<void>;
}

async function connectJsonLineClient(socketPath: string): Promise<JsonLineClient> {
  const client = net.createConnection(socketPath);
  client.setEncoding("utf8");

  await waitForConnect(client);

  const nextFrame = createJsonLineReader(client);

  return {
    send(frame: Record<string, unknown>) {
      client.write(`${JSON.stringify(frame)}\n`);
    },
    nextFrame,
    close() {
      return new Promise((resolve) => {
        client.end(() => resolve());
      });
    },
  };
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
