import { EventEmitter } from "node:events";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createDaemonTransportClient,
  type DaemonTransportError,
  invokeDaemonMethod,
} from "./daemon-transport.js";

describe("daemon transport client", () => {
  const cleanup: Array<() => Promise<void> | void> = [];

  afterEach(async () => {
    while (cleanup.length > 0) {
      const dispose = cleanup.pop();
      await dispose?.();
    }
  });

  it("executes daemon request flow with handshake + request response", async () => {
    const socketPath = createSocketPath();
    const receivedMethods: string[] = [];

    const server = net.createServer((socket) => {
      socket.setEncoding("utf8");
      let buffer = "";

      socket.on("data", (chunk: string) => {
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const frame = JSON.parse(line) as {
            id: string;
            method: string;
            params: Record<string, unknown>;
          };

          receivedMethods.push(frame.method);

          if (frame.method === "daemon.hello") {
            socket.write(
              `${JSON.stringify({
                id: frame.id,
                result: {
                  protocolVersion: "1",
                  daemonVersion: "test",
                  role: "node",
                  capabilities: { methods: [], events: [] },
                  catalog: { id: null },
                },
              })}\n`,
            );
            continue;
          }

          if (frame.method === "daemon.ping") {
            socket.write(`${JSON.stringify({ id: frame.id, result: { ok: true } })}\n`);
          }
        }
      });
    });

    await listen(server, socketPath);
    cleanup.push(() => closeServer(server));

    const client = createDaemonTransportClient({ socketPath });
    const response = await client.request<{ ok: true }>("daemon.ping", {});

    expect(response).toEqual({ ok: true, value: { ok: true } });
    expect(receivedMethods).toEqual(["daemon.hello", "daemon.ping"]);
  });

  it("returns DAEMON_UNAVAILABLE for missing daemon socket", async () => {
    const socketPath = path.join(os.tmpdir(), `todu-daemon-missing-${Date.now()}.sock`);

    const response = await invokeDaemonMethod({
      socketPath,
      method: "daemon.ping",
      params: {},
      connectTimeoutMs: 50,
    });

    expect(response.ok).toBe(false);
    if (response.ok) {
      throw new Error("Expected daemon unavailable error");
    }

    expect(response.error).toEqual<DaemonTransportError>(
      expect.objectContaining({
        code: "DAEMON_UNAVAILABLE",
        message: `Daemon unavailable at socket: ${socketPath}`,
        details: expect.objectContaining({
          socketPath,
          reason: "ENOENT",
        }),
      }),
    );
  });

  it("returns TIMEOUT when daemon does not answer request within timeout", async () => {
    const socketPath = createSocketPath();

    const server = net.createServer((socket) => {
      socket.setEncoding("utf8");
      let buffer = "";

      socket.on("data", (chunk: string) => {
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const frame = JSON.parse(line) as { id: string; method: string };

          if (frame.method === "daemon.hello") {
            socket.write(
              `${JSON.stringify({
                id: frame.id,
                result: {
                  protocolVersion: "1",
                  daemonVersion: "test",
                  role: "node",
                  capabilities: { methods: [], events: [] },
                  catalog: { id: null },
                },
              })}\n`,
            );
          }

          // Intentionally do not reply for daemon.ping to force timeout path.
        }
      });
    });

    await listen(server, socketPath);
    cleanup.push(() => closeServer(server));

    const client = createDaemonTransportClient({
      socketPath,
      requestTimeoutMs: 40,
    });

    const response = await client.request("daemon.ping", {});
    expect(response.ok).toBe(false);
    if (response.ok) {
      throw new Error("Expected timeout error");
    }

    expect(response.error.code).toBe("TIMEOUT");
    expect(response.error.message).toBe("Daemon request timed out after 40ms");
    expect(response.error.details).toEqual(
      expect.objectContaining({
        method: "daemon.ping",
        timeoutMs: 40,
      }),
    );
  });

  it("returns DAEMON_UNAVAILABLE on connect timeout", async () => {
    const hangingSocket = new HangingSocket();
    const client = createDaemonTransportClient({
      socketPath: "/tmp/never-used.sock",
      connectTimeoutMs: 25,
      connect: () => hangingSocket as unknown as net.Socket,
    });

    const response = await client.request("daemon.ping", {});

    expect(response.ok).toBe(false);
    if (response.ok) {
      throw new Error("Expected connect timeout failure");
    }

    expect(response.error).toEqual(
      expect.objectContaining({
        code: "DAEMON_UNAVAILABLE",
        message: "Timed out connecting to daemon socket after 25ms",
        details: expect.objectContaining({
          timeoutMs: 25,
        }),
      }),
    );
  });
});

class HangingSocket extends EventEmitter {
  setEncoding(): this {
    return this;
  }

  write(): boolean {
    return true;
  }

  end(): this {
    this.emit("end");
    return this;
  }

  destroy(): this {
    this.emit("close");
    return this;
  }
}

async function listen(server: net.Server, socketPath: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(socketPath), { recursive: true });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

async function closeServer(server: net.Server): Promise<void> {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
}

function createSocketPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-cli-daemon-transport-test-"));
  return path.join(dir, "daemon.sock");
}
