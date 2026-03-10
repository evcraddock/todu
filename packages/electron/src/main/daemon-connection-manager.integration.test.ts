import fs from "node:fs";
import net, { type Socket } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDaemonConnectionManager,
  DAEMON_PROTOCOL_VERSION,
  type DaemonConnectionResult,
} from "./daemon-connection-manager.js";

describe("createDaemonConnectionManager", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses bounded reconnect backoff (250ms → 500ms → 1s → 2s cap)", async () => {
    const scheduledDelays: number[] = [];
    const manager = createDaemonConnectionManager({
      socketPath: "/tmp/never-used.sock",
      connect: () => createFailingSocket("ENOENT"),
      hooks: {
        onReconnectScheduled: (info) => {
          scheduledDelays.push(info.delayMs);
        },
      },
    });

    manager.start();

    await waitForCondition(() => scheduledDelays.length >= 5, "backoff attempts", 6_000);

    expect(scheduledDelays.slice(0, 5)).toEqual([250, 500, 1_000, 2_000, 2_000]);

    manager.stop();
  });

  it("reconnects and re-runs lifecycle hooks after daemon restart", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-electron-daemon-conn-"));
    const socketPath = path.join(tmpDir, "daemon.sock");

    const daemon = createMockDaemonServer(socketPath);
    await daemon.start();

    let connectedCount = 0;
    let reconnectedCount = 0;

    const manager = createDaemonConnectionManager({
      socketPath,
      hooks: {
        onConnected: async ({ isReconnect, request }) => {
          connectedCount += 1;

          const hello = await request<{ protocolVersion: string }>("daemon.hello", {
            protocolVersion: DAEMON_PROTOCOL_VERSION,
          });
          assertOk(hello, "daemon.hello");

          if (isReconnect) {
            const subscribe = await request<{ subscribed: string[] }>("events.subscribe", {
              events: ["data.changed", "sync.statusChanged"],
            });
            assertOk(subscribe, "events.subscribe");
            reconnectedCount += 1;
          }
        },
      },
    });

    manager.start();

    await waitForCondition(() => connectedCount >= 1, "initial daemon connection");

    const ping = await manager.request<{ pong: boolean }>("daemon.ping");
    expect(ping).toEqual({ ok: true, value: { pong: true } });

    await daemon.stop();
    await waitForCondition(() => !manager.isConnected(), "disconnect after daemon stop");

    await daemon.start();

    await waitForCondition(() => connectedCount >= 2, "daemon reconnect");
    await waitForCondition(() => reconnectedCount >= 1, "reconnect lifecycle hook");

    expect(
      daemon.methodCalls.filter((method) => method === "daemon.hello").length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      daemon.methodCalls.filter((method) => method === "events.subscribe").length,
    ).toBeGreaterThanOrEqual(1);

    manager.stop();
    await daemon.stop();
  });
});

function createFailingSocket(code: string): Socket {
  const socket = new net.Socket();

  setTimeout(() => {
    const error = new Error("connect failed") as NodeJS.ErrnoException;
    error.code = code;
    socket.emit("error", error);
  }, 0);

  return socket;
}

interface MockDaemonServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  methodCalls: string[];
}

function createMockDaemonServer(socketPath: string): MockDaemonServer {
  let server: net.Server | null = null;
  const sockets = new Set<Socket>();
  const methodCalls: string[] = [];

  return {
    methodCalls,

    async start(): Promise<void> {
      await fs.promises.mkdir(path.dirname(socketPath), { recursive: true });
      try {
        await fs.promises.unlink(socketPath);
      } catch {
        // Socket did not exist.
      }

      server = net.createServer((socket) => {
        sockets.add(socket);
        socket.setEncoding("utf8");

        let buffer = "";

        socket.on("data", (chunk: string) => {
          buffer += chunk;
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.length === 0) {
              continue;
            }

            const frame = JSON.parse(trimmed) as {
              id?: string;
              method?: string;
              params?: Record<string, unknown>;
            };

            if (typeof frame.method !== "string" || typeof frame.id !== "string") {
              continue;
            }

            methodCalls.push(frame.method);

            if (frame.method === "daemon.hello") {
              socket.write(
                `${JSON.stringify({ id: frame.id, result: { protocolVersion: DAEMON_PROTOCOL_VERSION } })}\n`,
              );
              continue;
            }

            if (frame.method === "events.subscribe") {
              const events = Array.isArray(frame.params?.events)
                ? (frame.params?.events as string[])
                : [];
              socket.write(`${JSON.stringify({ id: frame.id, result: { subscribed: events } })}\n`);
              continue;
            }

            if (frame.method === "daemon.ping") {
              socket.write(`${JSON.stringify({ id: frame.id, result: { pong: true } })}\n`);
              continue;
            }

            socket.write(
              `${JSON.stringify({
                id: frame.id,
                error: { code: "METHOD_NOT_FOUND", message: `Unknown method: ${frame.method}` },
              })}\n`,
            );
          }
        });

        const removeSocket = () => {
          sockets.delete(socket);
        };

        socket.on("close", removeSocket);
        socket.on("error", removeSocket);
      });

      await new Promise<void>((resolve, reject) => {
        server?.once("error", reject);
        server?.listen(socketPath, () => {
          server?.off("error", reject);
          resolve();
        });
      });
    },

    async stop(): Promise<void> {
      for (const socket of sockets) {
        socket.destroy();
      }
      sockets.clear();

      if (server) {
        const activeServer = server;
        server = null;

        await new Promise<void>((resolve) => {
          activeServer.close(() => {
            resolve();
          });
        });
      }

      try {
        await fs.promises.unlink(socketPath);
      } catch {
        // Already removed.
      }
    },
  };
}

function assertOk<T>(
  result: DaemonConnectionResult<T>,
  method: string,
): asserts result is { ok: true; value: T } {
  if (!result.ok) {
    throw new Error(`${method} failed: ${result.error.code} ${result.error.message}`);
  }
}

async function waitForCondition(
  predicate: () => boolean,
  label: string,
  timeoutMs = 6_000,
): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 25);
    });
  }

  throw new Error(`Timed out waiting for condition: ${label}`);
}
