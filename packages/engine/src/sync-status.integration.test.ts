import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTodu } from "./index.js";

const TEST_SYNC_PORT = 24398;
const RUN_SYNC_SERVER_TESTS =
  (process.env.TODU_RUN_SYNC_SERVER_TESTS ?? process.env.TODUAI_RUN_SYNC_SERVER_TESTS) === "1";

describe("sync status", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-sync-status-"));
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 100));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("standalone mode reports correct status", async () => {
    const todu = await createTodu({ storagePath: tmpDir });

    const status = todu.sync.status();
    expect(status.local.mode).toBe("standalone");
    expect(status.remote.state).toBe("disconnected");
    expect(status.remote.server).toBeUndefined();
    expect(status.remote.lastSync).toBeUndefined();

    await todu.close();
  });

  (RUN_SYNC_SERVER_TESTS ? it : it.skip)("sync-server mode reports correct status", async () => {
    const todu = await createTodu({
      storagePath: tmpDir,
      syncServer: true,
      syncPort: TEST_SYNC_PORT,
    });

    const status = todu.sync.status();
    expect(status.local.mode).toBe("sync-server");
    expect(status.remote.state).toBe("disconnected");

    await todu.close();
  });

  (RUN_SYNC_SERVER_TESTS ? it : it.skip)(
    "ephemeral-client mode reports correct status",
    async () => {
      // Need a server for the client to connect to
      const server = await createTodu({
        storagePath: tmpDir,
        syncServer: true,
        syncPort: TEST_SYNC_PORT,
      });
      await new Promise((r) => setTimeout(r, 100));

      const client = await createTodu({
        storagePath: tmpDir,
        syncClient: true,
        syncPort: TEST_SYNC_PORT,
      });

      const status = client.sync.status();
      expect(status.local.mode).toBe("ephemeral-client");
      expect(status.remote.state).toBe("disconnected");

      await client.close();
      await server.close();
    },
  );

  it("start() and stop() are no-ops (remote sync not yet implemented)", async () => {
    const todu = await createTodu({ storagePath: tmpDir });

    // Should not throw
    await todu.sync.start();
    await todu.sync.stop();

    // Status unchanged
    const status = todu.sync.status();
    expect(status.remote.state).toBe("disconnected");

    await todu.close();
  });
});
