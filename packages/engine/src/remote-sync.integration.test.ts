import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { WebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTodu } from "./index.js";
import type { Todu } from "./todu.js";

const RUN_SYNC_SERVER_TESTS = process.env.TODU_RUN_SYNC_SERVER_TESTS === "1";

// Unique port per test — avoids OS TIME_WAIT reuse issues when tests
// run back-to-back. Base port chosen to avoid conflicts with other test files
// (sync-status: 24398, sync: 24399).
const RELAY_PORTS = {
  connected: 24401,
  stop: 24402,
  start: 24403,
  noOp: 24404,
  reconcile: 24405,
  watchdog: 24406,
};

/**
 * Wait for sync status to reach the expected remote state.
 * Polls every 50ms up to the timeout.
 */
async function waitForRemoteState(
  todu: Todu,
  expected: "connected" | "disconnected",
  timeoutMs = 3000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (todu.sync.status().remote.state === expected) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(
    `Timed out waiting for remote state "${expected}". Current: "${todu.sync.status().remote.state}"`,
  );
}

/**
 * Create and start a relay server (acts as the remote sync server in tests).
 * Returns the todu instance and a cleanup function.
 *
 * IMPORTANT: Always call cleanup() before closing the client todu instance
 * would cause relay.close() to fail — relay.close() flushes its repo and
 * will throw if a connected client is still sending sync messages.
 * Pattern: close client first, wait briefly, then call cleanup().
 */
async function startRelay(port: number): Promise<{ relay: Todu; relayDir: string }> {
  const relayDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-relay-"));
  const relay = await createTodu({
    storagePath: relayDir,
    syncServer: true,
    syncPort: port,
  });
  // Allow server to fully initialize before clients connect
  await new Promise((r) => setTimeout(r, 100));
  return { relay, relayDir };
}

async function stopRelay(relay: Todu, relayDir: string): Promise<void> {
  await new Promise((r) => setTimeout(r, 100));
  await relay.close();
  fs.rmSync(relayDir, { recursive: true, force: true });
}

describe("remote sync", () => {
  let tmpDir: string;
  let todu: Todu | null = null;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-remote-sync-"));
  });

  afterEach(async () => {
    if (todu) {
      await todu.close();
      todu = null;
    }
    await new Promise((r) => setTimeout(r, 100));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("status includes server URL when remoteSync configured", async () => {
    todu = await createTodu({
      storagePath: tmpDir,
      remoteSync: { server: "ws://localhost:3030" },
    });

    const status = todu.sync.status();
    expect(status.remote.server).toBe("ws://localhost:3030");
  });

  it("status is disconnected initially (no relay running)", async () => {
    todu = await createTodu({
      storagePath: tmpDir,
      remoteSync: { server: "ws://localhost:19999" }, // nothing listening here
    });

    expect(todu.sync.status().remote.state).toBe("disconnected");
  });

  (RUN_SYNC_SERVER_TESTS ? it : it.skip)(
    "status becomes connected when relay is available",
    { timeout: 10000 },
    async () => {
      const { relay, relayDir } = await startRelay(RELAY_PORTS.connected);

      try {
        todu = await createTodu({
          storagePath: tmpDir,
          remoteSync: { server: `ws://localhost:${RELAY_PORTS.connected}` },
        });

        await waitForRemoteState(todu, "connected");
        expect(todu.sync.status().remote.state).toBe("connected");
      } finally {
        // Close client before relay to avoid flush errors
        if (todu) {
          await todu.close();
          todu = null;
        }
        await stopRelay(relay, relayDir);
      }
    },
  );

  (RUN_SYNC_SERVER_TESTS ? it : it.skip)(
    "sync.stop() sets state to disconnected and prevents reconnect",
    { timeout: 10000 },
    async () => {
      const { relay, relayDir } = await startRelay(RELAY_PORTS.stop);

      try {
        todu = await createTodu({
          storagePath: tmpDir,
          remoteSync: { server: `ws://localhost:${RELAY_PORTS.stop}` },
        });

        await waitForRemoteState(todu, "connected");
        await todu.sync.stop();

        expect(todu.sync.status().remote.state).toBe("disconnected");

        // Wait to confirm it does not auto-reconnect
        await new Promise((r) => setTimeout(r, 200));
        expect(todu.sync.status().remote.state).toBe("disconnected");
      } finally {
        if (todu) {
          await todu.close();
          todu = null;
        }
        await stopRelay(relay, relayDir);
      }
    },
  );

  (RUN_SYNC_SERVER_TESTS ? it : it.skip)(
    "sync.start() reconnects after stop",
    { timeout: 10000 },
    async () => {
      const { relay, relayDir } = await startRelay(RELAY_PORTS.start);

      try {
        todu = await createTodu({
          storagePath: tmpDir,
          remoteSync: { server: `ws://localhost:${RELAY_PORTS.start}` },
        });

        await waitForRemoteState(todu, "connected");
        await todu.sync.stop();
        expect(todu.sync.status().remote.state).toBe("disconnected");

        await todu.sync.start();
        await waitForRemoteState(todu, "connected");
        expect(todu.sync.status().remote.state).toBe("connected");
      } finally {
        if (todu) {
          await todu.close();
          todu = null;
        }
        await stopRelay(relay, relayDir);
      }
    },
  );

  (RUN_SYNC_SERVER_TESTS ? it : it.skip)(
    "sync.start() is a no-op when already running",
    { timeout: 10000 },
    async () => {
      const { relay, relayDir } = await startRelay(RELAY_PORTS.noOp);

      try {
        todu = await createTodu({
          storagePath: tmpDir,
          remoteSync: { server: `ws://localhost:${RELAY_PORTS.noOp}` },
        });

        await waitForRemoteState(todu, "connected");

        // Calling start() again should not throw or create a second adapter
        await todu.sync.start();
        expect(todu.sync.status().remote.state).toBe("connected");
      } finally {
        if (todu) {
          await todu.close();
          todu = null;
        }
        await stopRelay(relay, relayDir);
      }
    },
  );

  (RUN_SYNC_SERVER_TESTS ? it : it.skip)(
    "sync.status() reconciles an already-connected adapter after a stale disconnect event",
    { timeout: 10000 },
    async () => {
      const { relay, relayDir } = await startRelay(RELAY_PORTS.reconcile);
      let connectedAdapter: WebSocketClientAdapter | null = null;
      const originalPeerCandidate = WebSocketClientAdapter.prototype.peerCandidate;
      const peerCandidateSpy = vi
        .spyOn(WebSocketClientAdapter.prototype, "peerCandidate")
        .mockImplementation(function mockPeerCandidate(
          this: WebSocketClientAdapter,
          ...args: Parameters<WebSocketClientAdapter["peerCandidate"]>
        ) {
          connectedAdapter = this;
          return originalPeerCandidate.apply(this, args);
        });

      try {
        todu = await createTodu({
          storagePath: tmpDir,
          remoteSync: { server: `ws://localhost:${RELAY_PORTS.reconcile}` },
        });

        await waitForRemoteState(todu, "connected");
        expect(connectedAdapter).not.toBeNull();

        connectedAdapter?.emit("peer-disconnected", {
          peerId: connectedAdapter.remotePeerId,
        });
        expect(todu.sync.status().remote.state).toBe("connected");
      } finally {
        peerCandidateSpy.mockRestore();
        if (todu) {
          await todu.close();
          todu = null;
        }
        await stopRelay(relay, relayDir);
      }
    },
  );

  (RUN_SYNC_SERVER_TESTS ? it : it.skip)(
    "repeatedly replaces stale adapters without retaining sync resources",
    { timeout: 20000 },
    async () => {
      const { relay, relayDir } = await startRelay(RELAY_PORTS.watchdog);
      let connectedAdapter: WebSocketClientAdapter | null = null;
      const observedAdapters = new Set<WebSocketClientAdapter>();
      const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
      };
      const originalPeerCandidate = WebSocketClientAdapter.prototype.peerCandidate;
      const peerCandidateSpy = vi
        .spyOn(WebSocketClientAdapter.prototype, "peerCandidate")
        .mockImplementation(function mockPeerCandidate(
          this: WebSocketClientAdapter,
          ...args: Parameters<WebSocketClientAdapter["peerCandidate"]>
        ) {
          connectedAdapter = this;
          observedAdapters.add(this);
          return originalPeerCandidate.apply(this, args);
        });
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      try {
        todu = await createTodu({
          storagePath: tmpDir,
          remoteSync: { server: `ws://localhost:${RELAY_PORTS.watchdog}` },
          remoteSyncWatchdogIntervalMs: 20,
          remoteSyncAvailabilityTimeoutMs: 200,
          syncLogger: logger,
        });

        await waitForRemoteState(todu, "connected");
        const project = await todu.project.create({ name: "Reconnect regression" });
        expect(project.ok).toBe(true);
        if (!project.ok) return;
        const task = await todu.task.create({
          title: "Loaded during reconnect",
          projectId: project.value.id,
        });
        expect(task.ok).toBe(true);

        for (let attempt = 0; attempt < 3; attempt += 1) {
          const staleAdapter = connectedAdapter;
          expect(staleAdapter).not.toBeNull();
          const staleSocket = staleAdapter?.socket as
            | (WebSocketClientAdapter["socket"] & { terminate?: () => void })
            | undefined;
          if (staleSocket?.terminate) {
            staleSocket.terminate();
          } else {
            staleSocket?.close();
          }

          const replacementDeadline = Date.now() + 3000;
          while (connectedAdapter === staleAdapter && Date.now() < replacementDeadline) {
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
          await waitForRemoteState(todu, "connected");

          expect(connectedAdapter).not.toBe(staleAdapter);
          expect(staleAdapter?.socket).toBeUndefined();
          expect(staleAdapter?.eventNames()).toEqual([]);

          const listStartedAt = performance.now();
          const listResult = await todu.task.list({ projectId: project.value.id });
          const listDurationMs = performance.now() - listStartedAt;
          expect(listResult.ok).toBe(true);
          expect(listDurationMs).toBeLessThan(1000);
        }

        expect(observedAdapters.size).toBe(4);
        expect(logger.warn).toHaveBeenCalledWith(
          "remote sync watchdog restarting stale adapter",
          expect.objectContaining({ server: `ws://localhost:${RELAY_PORTS.watchdog}` }),
        );
        expect(
          consoleLogSpy.mock.calls.some((args) =>
            args.some((value) => {
              if (value instanceof Error) {
                return value.message.includes("outdated document");
              }
              if (typeof value === "object" && value !== null && "err" in value) {
                const error = (value as { err?: unknown }).err;
                return error instanceof Error && error.message.includes("outdated document");
              }
              return String(value).includes("outdated document");
            }),
          ),
        ).toBe(false);
      } finally {
        consoleLogSpy.mockRestore();
        peerCandidateSpy.mockRestore();
        if (todu) {
          await todu.close();
          todu = null;
        }
        await stopRelay(relay, relayDir);
      }
    },
  );

  it("keeps local operations available when remote adapter emits ECONNRESET", async () => {
    const connectSpy = vi
      .spyOn(WebSocketClientAdapter.prototype, "connect")
      .mockImplementation(function mockConnectWithReset(this: WebSocketClientAdapter) {
        const error = Object.assign(new Error("read ECONNRESET"), {
          code: "ECONNRESET",
        });

        this.onError({ error } as unknown as Parameters<WebSocketClientAdapter["onError"]>[0]);
      });

    try {
      todu = await createTodu({
        storagePath: tmpDir,
        remoteSync: { server: "ws://localhost:3030" },
      });

      const createResult = await todu.project.create({ name: "Works while sync is down" });
      expect(createResult.ok).toBe(true);

      const listResult = await todu.project.list();
      expect(listResult.ok).toBe(true);
      if (listResult.ok) {
        expect(
          listResult.value.some((project) => project.name === "Works while sync is down"),
        ).toBe(true);
      }

      expect(todu.sync.status().remote.state).toBe("disconnected");
    } finally {
      connectSpy.mockRestore();
    }
  });

  it("no remoteSync config: start() and stop() are no-ops", async () => {
    todu = await createTodu({ storagePath: tmpDir });

    await todu.sync.start();
    await todu.sync.stop();

    expect(todu.sync.status().remote.state).toBe("disconnected");
    expect(todu.sync.status().remote.server).toBeUndefined();
  });
});
