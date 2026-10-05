import { ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type DaemonFileConfig, loadDaemonFileConfig } from "../../../daemon/src/config.js";
import { startDaemonForTests } from "./daemon-process.js";

vi.mock("node:child_process", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:child_process")>();
  return { ...original, spawn: vi.fn() };
});

describe("test daemon configuration isolation", () => {
  let tmpDir: string;
  let storagePath: string;
  let loadedConfigs: DaemonFileConfig[];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-test-daemon-isolation-"));
    const homeDir = path.join(tmpDir, "host-home");
    const configDir = path.join(homeDir, ".config", "todu");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "config.yaml"),
      "identity:\n  ownerActor:\n    id: actor-host\n    displayName: Host owner\nsync:\n  remote:\n    server: ws://127.0.0.1:1\n    enabled: true\n",
    );
    vi.stubEnv("HOME", homeDir);
    vi.stubEnv("TODU_CONFIG", "");
    vi.stubEnv("TODU_SYNC_SERVER", "");
    vi.stubEnv("TODU_SYNC_ENABLED", "");
    storagePath = path.join(tmpDir, "test-storage");
    fs.mkdirSync(storagePath);
    loadedConfigs = [];

    vi.mocked(spawn).mockImplementation((_command, _args, options) => {
      const env = options?.env;
      if (!env) {
        throw new Error("Test daemon must receive an explicit environment");
      }
      for (const name of ["HOME", "TODU_CONFIG", "TODU_SYNC_SERVER", "TODU_SYNC_ENABLED"]) {
        vi.stubEnv(name, env[name]);
      }
      loadedConfigs.push(loadDaemonFileConfig());
      fs.writeFileSync(path.join(storagePath, "daemon.sock"), "");
      const child = new ChildProcess();
      child.exitCode = 0;
      return child;
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("does not bootstrap a host-configured owner or connect to its remote server", async () => {
    const daemon = await startDaemonForTests("/fixture-root", storagePath);
    expect(loadedConfigs).toHaveLength(1);
    expect(loadedConfigs[0].bootstrapOwnerActor).toBeNull();
    expect(loadedConfigs[0].remoteSync).toBeNull();
    await daemon.stop();
  });

  it("creates nested storage directories before writing its isolated config", async () => {
    storagePath = path.join(storagePath, "nested", "data");
    const daemon = await startDaemonForTests("/fixture-root", storagePath);
    expect(loadedConfigs[0].bootstrapOwnerActor).toBeNull();
    expect(loadedConfigs[0].remoteSync).toBeNull();
    await daemon.stop();
  });

  it("disables remote sync even when the parent environment enables it", async () => {
    vi.stubEnv("TODU_SYNC_SERVER", "ws://127.0.0.1:1");
    vi.stubEnv("TODU_SYNC_ENABLED", "true");
    const daemon = await startDaemonForTests("/fixture-root", storagePath);
    expect(loadedConfigs[0].remoteSync).toBeNull();
    await daemon.stop();
  });
});
