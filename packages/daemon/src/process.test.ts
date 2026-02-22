import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startDaemonProcess } from "./process.js";

describe("startDaemonProcess", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-daemon-process-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("runs lifecycle hooks and shuts down cleanly", async () => {
    const events: string[] = [];

    const daemon = await startDaemonProcess(
      { storagePath: tmpDir, role: "authority" },
      {
        registerSignalHandlers: false,
        hooks: {
          onStarted: (status) => {
            events.push(`started:${status.role}`);
          },
          onStopping: (reason) => {
            events.push(`stopping:${reason}`);
          },
          onStopped: () => {
            events.push("stopped");
          },
        },
      },
    );

    expect(daemon.runtime.status().state).toBe("running");

    await daemon.stop("test");
    await daemon.waitForShutdown();

    expect(daemon.runtime.status().state).toBe("stopped");
    expect(events).toEqual(["started:authority", "stopping:test", "stopped"]);
  });
});
