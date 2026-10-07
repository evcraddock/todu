import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { WebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startTestSyncServer } from "../../../scripts/test-helpers/sync-server.js";
import { createTodu } from "./index.js";
import type { Todu } from "./todu.js";

async function waitForRemoteState(
  todu: Todu,
  expected: "connected" | "disconnected",
  timeoutMs = 3000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (todu.sync.status().remote.state === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(
    `Timed out waiting for remote state "${expected}". Current: "${todu.sync.status().remote.state}"`,
  );
}

describe("remote sync", () => {
  let tmpDir: string;
  let todu: Todu | undefined;
  let relay: Todu | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-remote-sync-"));
  });

  afterEach(async () => {
    try {
      try {
        await todu?.close();
      } finally {
        await relay?.close();
      }
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } finally {
      todu = undefined;
      relay = undefined;
      vi.restoreAllMocks();
    }
  });

  async function openRelay(): Promise<string> {
    const started = await startTestSyncServer(path.join(tmpDir, "relay"));
    relay = started.server;
    return started.url;
  }

  it("reports the configured URL and disconnected state before connection", async () => {
    vi.spyOn(WebSocketClientAdapter.prototype, "connect").mockImplementation(() => {});
    const server = "ws://127.0.0.1:1";
    todu = await createTodu({ storagePath: tmpDir, remoteSync: { server } });
    expect(todu.sync.status().remote).toEqual({ server, state: "disconnected" });
  });

  it("connects, starts idempotently, stays stopped, and reconnects on explicit start", async () => {
    const server = await openRelay();
    const connect = vi.spyOn(WebSocketClientAdapter.prototype, "connect");
    todu = await createTodu({
      storagePath: path.join(tmpDir, "client"),
      remoteSync: { server },
      remoteSyncWatchdogIntervalMs: 20,
    });
    await waitForRemoteState(todu, "connected");
    expect(connect).toHaveBeenCalledTimes(1);

    await todu.sync.start();
    expect(todu.sync.status().remote.state).toBe("connected");
    expect(connect).toHaveBeenCalledTimes(1);

    await todu.sync.stop();
    expect(todu.sync.status().remote.state).toBe("disconnected");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(todu.sync.status().remote.state).toBe("disconnected");
    expect(connect).toHaveBeenCalledTimes(1);

    await todu.sync.start();
    await waitForRemoteState(todu, "connected");
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it("reconciles an already-connected adapter after a stale disconnect event", async () => {
    const server = await openRelay();
    let connectedAdapter: WebSocketClientAdapter | undefined;
    const peerCandidate = WebSocketClientAdapter.prototype.peerCandidate;
    vi.spyOn(WebSocketClientAdapter.prototype, "peerCandidate").mockImplementation(function (
      this: WebSocketClientAdapter,
      ...args: Parameters<WebSocketClientAdapter["peerCandidate"]>
    ) {
      connectedAdapter = this;
      return peerCandidate.apply(this, args);
    });
    todu = await createTodu({
      storagePath: path.join(tmpDir, "client"),
      remoteSync: { server },
    });
    await waitForRemoteState(todu, "connected");
    expect(connectedAdapter).toBeDefined();
    connectedAdapter?.emit("peer-disconnected", { peerId: connectedAdapter.remotePeerId });
    expect(todu.sync.status().remote.state).toBe("connected");
  });

  it(
    "repeatedly replaces stale adapters without retaining sync resources",
    { timeout: 20000 },
    async () => {
      const server = await openRelay();
      let connectedAdapter: WebSocketClientAdapter | undefined;
      const observedAdapters = new Set<WebSocketClientAdapter>();
      const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() };
      const peerCandidate = WebSocketClientAdapter.prototype.peerCandidate;
      vi.spyOn(WebSocketClientAdapter.prototype, "peerCandidate").mockImplementation(function (
        this: WebSocketClientAdapter,
        ...args: Parameters<WebSocketClientAdapter["peerCandidate"]>
      ) {
        connectedAdapter = this;
        observedAdapters.add(this);
        return peerCandidate.apply(this, args);
      });
      const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
      todu = await createTodu({
        storagePath: path.join(tmpDir, "client"),
        remoteSync: { server },
        remoteSyncWatchdogIntervalMs: 20,
        remoteSyncAvailabilityTimeoutMs: 200,
        syncLogger: logger,
      });
      await waitForRemoteState(todu, "connected");
      const project = await todu.project.create({ name: "Reconnect regression" });
      expect(project.ok).toBe(true);
      if (!project.ok) throw new Error(JSON.stringify(project.error));
      const task = await todu.task.create({
        title: "Loaded during reconnect",
        projectId: project.value.id,
      });
      expect(task.ok).toBe(true);
      if (!task.ok) throw new Error(JSON.stringify(task.error));

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const staleAdapter = connectedAdapter;
        expect(staleAdapter).toBeDefined();
        const staleSocket = staleAdapter?.socket as
          | (WebSocketClientAdapter["socket"] & { terminate?: () => void })
          | undefined;
        if (staleSocket?.terminate) staleSocket.terminate();
        else staleSocket?.close();

        const deadline = Date.now() + 3000;
        while (connectedAdapter === staleAdapter && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        await waitForRemoteState(todu, "connected");
        expect(connectedAdapter).not.toBe(staleAdapter);
        expect(staleAdapter?.socket).toBeUndefined();
        expect(staleAdapter?.eventNames()).toEqual([]);

        const listStartedAt = performance.now();
        const list = await todu.task.list({ projectId: project.value.id });
        expect(performance.now() - listStartedAt).toBeLessThan(1000);
        expect(list.ok).toBe(true);
        if (!list.ok) throw new Error(JSON.stringify(list.error));
        expect(list.value.map((entry) => entry.id)).toContain(task.value.id);
      }

      expect(observedAdapters.size).toBe(4);
      expect(logger.warn).toHaveBeenCalledWith(
        "remote sync watchdog restarting stale adapter",
        expect.objectContaining({ server }),
      );
      expect(
        consoleLog.mock.calls.some((args) =>
          args.some((value) => {
            if (value instanceof Error) return value.message.includes("outdated document");
            if (typeof value === "object" && value !== null && "err" in value) {
              const error = (value as { err?: unknown }).err;
              return error instanceof Error && error.message.includes("outdated document");
            }
            return String(value).includes("outdated document");
          }),
        ),
      ).toBe(false);
    },
  );

  it("keeps local operations available when remote adapter emits ECONNRESET", async () => {
    vi.spyOn(WebSocketClientAdapter.prototype, "connect").mockImplementation(function (
      this: WebSocketClientAdapter,
    ) {
      const error = Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });
      this.onError({ error } as unknown as Parameters<WebSocketClientAdapter["onError"]>[0]);
    });
    todu = await createTodu({
      storagePath: tmpDir,
      remoteSync: { server: "ws://127.0.0.1:1" },
    });
    expect((await todu.project.create({ name: "Works while sync is down" })).ok).toBe(true);
    const list = await todu.project.list();
    expect(list.ok).toBe(true);
    if (list.ok)
      expect(list.value.map((project) => project.name)).toContain("Works while sync is down");
    expect(todu.sync.status().remote.state).toBe("disconnected");
  });

  it("start() and stop() are no-ops without remoteSync configuration", async () => {
    todu = await createTodu({ storagePath: tmpDir });
    await todu.sync.start();
    await todu.sync.stop();
    expect(todu.sync.status()).toMatchObject({
      local: { mode: "standalone" },
      remote: { state: "disconnected" },
    });
    expect(todu.sync.status().remote.server).toBeUndefined();
    expect(todu.sync.status().remote.lastSync).toBeUndefined();
  });
});
