import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDaemonRuntime } from "./runtime.js";

describe("createDaemonRuntime", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-daemon-runtime-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("defaults daemon role to node in runtime config", () => {
    const runtime = createDaemonRuntime({ storagePath: tmpDir });

    expect(runtime.config().role).toBe("node");
    expect(runtime.status().role).toBe("node");
    expect(runtime.status().state).toBe("stopped");
  });

  it("starts and reports running status with catalog id", async () => {
    const runtime = createDaemonRuntime({ storagePath: tmpDir, role: "authority" });

    const status = await runtime.start();

    expect(status.state).toBe("running");
    expect(status.role).toBe("authority");
    expect(status.startedAt).toBeDefined();
    expect(status.catalogId).toBeTruthy();

    await runtime.stop();
  });

  it("stops cleanly and clears runtime status", async () => {
    const runtime = createDaemonRuntime({ storagePath: tmpDir });

    await runtime.start();
    await runtime.stop();

    const status = runtime.status();
    expect(status.state).toBe("stopped");
    expect(status.startedAt).toBeUndefined();
    expect(status.catalogId).toBeUndefined();
  });

  it("treats repeated start and stop calls as safe no-ops", async () => {
    const runtime = createDaemonRuntime({ storagePath: tmpDir });

    const firstStart = await runtime.start();
    const secondStart = await runtime.start();

    expect(secondStart.state).toBe("running");
    expect(secondStart.catalogId).toBe(firstStart.catalogId);

    await runtime.stop();
    await expect(runtime.stop()).resolves.toBeUndefined();
  });
});
