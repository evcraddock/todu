import { type ChildProcess, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import type { Socket } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Repo } from "@automerge/automerge-repo";
import { createDeviceId } from "@todu/core";
import { describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { createEnrollmentPeerConnection } from "./enrollment-peer.js";
import {
  addRemoteSyncAdapter,
  connectSyncClient,
  disposeRemoteSyncAdapter,
  isSyncServerAvailable,
} from "./sync-client.js";

async function within<T>(promise: Promise<T>, milliseconds = 3_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Timed out waiting for socket fixture")),
          milliseconds,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function until(predicate: () => boolean, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Socket fixture condition did not settle");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function delayedServer(respondToClose = true) {
  const server = http.createServer();
  const websocketServer = new WebSocketServer({ noServer: true });
  const sockets = new Set<Socket>();
  const pending: Array<() => void> = [];
  let attempts = 0;
  let held = true;
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  server.on("upgrade", (request, socket, head) => {
    // Consume peer EOF even while the fixture withholds the HTTP upgrade response.
    socket.on("end", () => socket.end());
    socket.resume();
    attempts++;
    const accept = () => {
      if (socket.destroyed) return;
      if (!respondToClose) {
        const key = request.headers["sec-websocket-key"];
        if (!key) throw new Error("Fixture upgrade has no WebSocket key");
        const acceptKey = createHash("sha1")
          .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
          .digest("base64");
        socket.write(
          `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acceptKey}\r\n\r\n`,
        );
        return;
      }
      websocketServer.handleUpgrade(request, socket, head, (ws) => {
        websocketServer.emit("connection", ws, request);
      });
    };
    if (held) pending.push(accept);
    else accept();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture did not bind TCP");
  return {
    server,
    websocketServer,
    url: `ws://127.0.0.1:${address.port}`,
    attempts: () => attempts,
    socketCount: () => sockets.size,
    release() {
      held = false;
      for (const accept of pending.splice(0)) accept();
    },
    async close() {
      for (const ws of websocketServer.clients) ws.terminate();
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => websocketServer.close(() => resolve()));
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

async function expectNoSockets(server: Awaited<ReturnType<typeof delayedServer>>) {
  await until(() => server.socketCount() === 0, 1_000);
  expect(server.websocketServer.clients.size).toBe(0);
  const attempts = server.attempts();
  await new Promise((resolve) => setTimeout(resolve, 200));
  expect(server.socketCount()).toBe(0);
  expect(server.attempts()).toBe(attempts);
}

describe("replication socket ownership", () => {
  it.each([
    false,
    true,
  ])("closes every socket after initial handshake retries (delayed=%s)", async (delayed) => {
    const server = await delayedServer();
    const repo = new Repo({ network: [] });
    try {
      if (!delayed) server.release();
      const adapter = addRemoteSyncAdapter(repo, server.url, 60);
      if (delayed) {
        await until(() => server.attempts() >= 4);
        server.release();
      }
      await until(() => adapter.socket?.readyState === 1);
      disposeRemoteSyncAdapter(repo, adapter);
      await repo.shutdown();
      expect(adapter.socket).toBeUndefined();
      await expectNoSockets(server);
    } finally {
      await repo.shutdown();
      await server.close();
    }
  });

  it("closes retried sockets through the legacy sync-client disconnect function", async () => {
    const server = await delayedServer();
    const repo = new Repo({ network: [] });
    try {
      const connecting = connectSyncClient(repo, server.url, 60);
      await until(() => server.attempts() >= 4);
      server.release();
      const disconnect = await connecting;
      disconnect();
      await repo.shutdown();
      await expectNoSockets(server);
    } finally {
      await repo.shutdown();
      await server.close();
    }
  });

  it("cleans a successful availability probe and handles invalid probe construction", async () => {
    const server = await delayedServer();
    try {
      server.release();
      expect(await isSyncServerAvailable(server.url, 1_000)).toBe(true);
      await expectNoSockets(server);
      expect(await isSyncServerAvailable("invalid URL", 100)).toBe(false);
    } finally {
      await server.close();
    }
  });

  it("releases a timed-out availability probe's pending handshake", async () => {
    const server = await delayedServer();
    try {
      expect(await isSyncServerAvailable(server.url, 100)).toBe(false);
      await expectNoSockets(server);
    } finally {
      await server.close();
    }
  });

  it("does not wait for an unresponsive peer to acknowledge socket closure", async () => {
    const server = await delayedServer(false);
    const repo = new Repo({ network: [] });
    try {
      server.release();
      const adapter = addRemoteSyncAdapter(repo, server.url, 60);
      await until(() => adapter.socket?.readyState === 1);
      disposeRemoteSyncAdapter(repo, adapter);
      await repo.shutdown();
      await expectNoSockets(server);
    } finally {
      await repo.shutdown();
      await server.close();
    }
  });

  it("cancels superseded pending handshakes and refuses late retries after disposal", async () => {
    const server = await delayedServer();
    const repo = new Repo({ network: [] });
    try {
      const adapter = addRemoteSyncAdapter(repo, server.url, 60);
      await until(() => server.attempts() >= 4);
      disposeRemoteSyncAdapter(repo, adapter);
      await repo.shutdown();
      server.release();
      adapter.connect(repo.peerId, {});
      disposeRemoteSyncAdapter(repo, adapter);
      await expectNoSockets(server);
    } finally {
      await repo.shutdown();
      await server.close();
    }
  });

  it("does not accumulate abandoned connections across repeated adapter lifetimes", async () => {
    const repo = new Repo({ network: [] });
    try {
      for (let cycle = 0; cycle < 3; cycle++) {
        const server = await delayedServer();
        try {
          const adapter = addRemoteSyncAdapter(repo, server.url, 60);
          await until(() => server.attempts() >= 4);
          server.release();
          await until(() => adapter.socket?.readyState === 1);
          disposeRemoteSyncAdapter(repo, adapter);
          await expectNoSockets(server);
        } finally {
          await server.close();
        }
      }
    } finally {
      await repo.shutdown();
    }
  });

  it.each([false, true])(
    "retires native peer retries without accepting unverified identity (transferred=%s)",
    { timeout: 15_000 },
    async (transferred) => {
      const server = await delayedServer();
      const repo = new Repo({ network: [] });
      const adapter = transferred ? addRemoteSyncAdapter(repo, server.url, 60) : undefined;
      if (transferred) await until(() => server.attempts() >= 1);
      const peer = createEnrollmentPeerConnection({
        repo,
        adapter,
        source: {
          endpoint: server.url.replace("ws:", "http:"),
          approval: {
            catalogId: repo.create({ fixture: true }).documentId,
            deviceId: createDeviceId("fixture-local"),
            sourceDeviceId: createDeviceId("fixture-source"),
            syncPath: "/sync/fixture",
          },
        },
      });
      try {
        await until(() => server.attempts() >= 4, 8_000);
        server.release();
        await until(() => peer.getAdapter?.()?.socket?.readyState === 1);
        const controller = new AbortController();
        const ready = peer.ready(controller.signal);
        controller.abort();
        await expect(ready).rejects.toThrow();
        peer.close();
        peer.close();
        await repo.shutdown();
        await expectNoSockets(server);
      } finally {
        peer.close();
        await repo.shutdown();
        await server.close();
      }
    },
  );

  it(
    "allows natural client process exit while its independent peer is still listening",
    { timeout: 15_000 },
    async () => {
      const server = await delayedServer();
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), "todu-socket-exit-"));
      let child: ChildProcess | undefined;
      let exit: Promise<{ code: number | null; signal: NodeJS.Signals | null }> | undefined;
      let stderr = "";
      try {
        const env = Object.fromEntries(
          Object.entries(process.env).filter(([key]) => !key.startsWith("TODU_")),
        );
        const home = path.join(directory, "home");
        fs.mkdirSync(home);
        child = spawn(
          process.execPath,
          [
            "--import",
            "tsx",
            fileURLToPath(
              new URL(
                "../../../scripts/test-helpers/replication-socket-client.mjs",
                import.meta.url,
              ),
            ),
            server.url,
          ],
          {
            cwd: fileURLToPath(new URL("../../../", import.meta.url)),
            env: {
              ...env,
              HOME: home,
              XDG_CONFIG_HOME: path.join(directory, "config"),
              XDG_DATA_HOME: path.join(directory, "data"),
              XDG_CACHE_HOME: path.join(directory, "cache"),
            },
            stdio: ["ignore", "pipe", "pipe", "ipc"],
          },
        );
        exit = new Promise((resolve) =>
          child!.once("exit", (code, signal) => resolve({ code, signal })),
        );
        child.stderr?.on("data", (chunk) => {
          stderr += String(chunk);
        });
        const phases = new Set<string>();
        child.on("message", (message) => {
          if (typeof message === "object" && message !== null && "phase" in message)
            phases.add(String(message.phase));
        });
        await until(() => server.attempts() >= 4);
        server.release();
        await until(() => phases.has("connected"), 8_000);
        child.send("stop");
        const result = await within(exit);
        expect(result, stderr).toEqual({ code: 0, signal: null });
        expect(phases.has("shutdown-returned")).toBe(true);
        expect(server.server.listening).toBe(true);
        await expectNoSockets(server);
      } finally {
        // Only a failed fixture is terminated; success must be natural before peer teardown.
        if (child && exit && child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
          await exit;
        }
        await server.close();
        fs.rmSync(directory, { recursive: true });
      }
    },
  );
});
