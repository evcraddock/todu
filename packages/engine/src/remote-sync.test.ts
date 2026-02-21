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
    // Start a relay server (acts as remote sync server in tests)
    const relay = await createTodu({
      storagePath: fs.mkdtempSync(path.join(os.tmpdir(), "todu-relay-")),
      syncServer: true,
      syncPort: RELAY_PORT,
    });

    try {
      await new Promise((r) => setTimeout(r, 100));

      todu = await createTodu({
        storagePath: tmpDir,
        remoteSync: { server: `ws://localhost:${RELAY_PORT}` },
      });

      await waitForRemoteState(todu, "connected");
      expect(todu.sync.status().remote.state).toBe("connected");
    } finally {
      await relay.close();
    }
  });

  it("sync.stop() sets state to disconnected and removes adapter", { timeout: 10000 }, async () => {
    const relayDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-relay-"));
    const relay = await createTodu({
      storagePath: relayDir,
      syncServer: true,
      syncPort: RELAY_PORT,
    });

    try {
      await new Promise((r) => setTimeout(r, 100));

      todu = await createTodu({
        storagePath: tmpDir,
        remoteSync: { server: `ws://localhost:${RELAY_PORT}` },
      });

      await waitForRemoteState(todu, "connected");

      await todu.sync.stop();

      expect(todu.sync.status().remote.state).toBe("disconnected");

      // Wait a bit to confirm it doesn't auto-reconnect
      await new Promise((r) => setTimeout(r, 200));
      expect(todu.sync.status().remote.state).toBe("disconnected");
    } finally {
      await relay.close();
      fs.rmSync(relayDir, { recursive: true, force: true });
    }
  });

  it("sync.start() reconnects after stop", { timeout: 10000 }, async () => {
    const relayDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-relay-"));
    const relay = await createTodu({
      storagePath: relayDir,
      syncServer: true,
      syncPort: RELAY_PORT,
    });

    try {
      await new Promise((r) => setTimeout(r, 100));

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
      await relay.close();
      fs.rmSync(relayDir, { recursive: true, force: true });
    }
  });

  it("sync.start() is a no-op when already running", { timeout: 10000 }, async () => {
    const relayDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-relay-"));
    const relay = await createTodu({
      storagePath: relayDir,
      syncServer: true,
      syncPort: RELAY_PORT,
    });

    try {
      await new Promise((r) => setTimeout(r, 100));

      todu = await createTodu({
        storagePath: tmpDir,
        remoteSync: { server: `ws://localhost:${RELAY_PORT}` },
      });

      await waitForRemoteState(todu, "connected");

      // Calling start() again should not throw or create a second adapter
      await todu.sync.start();
      expect(todu.sync.status().remote.state).toBe("connected");
    } finally {
      await relay.close();
      fs.rmSync(relayDir, { recursive: true, force: true });
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
