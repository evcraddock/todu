import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTodu } from "./index.js";
import type { Todu } from "./todu.js";

// Use a port range that doesn't conflict with other test files
const RELAY_PORT = 24401;

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
async function startRelay(): Promise<{ relay: Todu; relayDir: string }> {
  const relayDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-relay-"));
  const relay = await createTodu({
    storagePath: relayDir,
    syncServer: true,
    syncPort: RELAY_PORT,
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

  it("status becomes connected when relay is available", { timeout: 10000 }, async () => {
    const { relay, relayDir } = await startRelay();

    try {
      todu = await createTodu({
        storagePath: tmpDir,
        remoteSync: { server: `ws://localhost:${RELAY_PORT}` },
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
  });

  it(
    "sync.stop() sets state to disconnected and prevents reconnect",
    { timeout: 10000 },
    async () => {
      const { relay, relayDir } = await startRelay();

      try {
        todu = await createTodu({
          storagePath: tmpDir,
          remoteSync: { server: `ws://localhost:${RELAY_PORT}` },
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

  it("sync.start() reconnects after stop", { timeout: 10000 }, async () => {
    const { relay, relayDir } = await startRelay();

    try {
      todu = await createTodu({
        storagePath: tmpDir,
        remoteSync: { server: `ws://localhost:${RELAY_PORT}` },
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
  });

  it("sync.start() is a no-op when already running", { timeout: 10000 }, async () => {
    const { relay, relayDir } = await startRelay();

    try {
      todu = await createTodu({
        storagePath: tmpDir,
        remoteSync: { server: `ws://localhost:${RELAY_PORT}` },
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
  });

  it("no remoteSync config: start() and stop() are no-ops", async () => {
    todu = await createTodu({ storagePath: tmpDir });

    await todu.sync.start();
    await todu.sync.stop();

    expect(todu.sync.status().remote.state).toBe("disconnected");
    expect(todu.sync.status().remote.server).toBeUndefined();
  });
});
