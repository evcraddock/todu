import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { type RemoteSyncSettings, updateRemoteSyncSettings } from "@todu/core";
import type { Todu } from "@todu/engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import type { DaemonRpcContext } from "./rpc.js";
import { createServerSettingsRuntime } from "./server-settings-runtime.js";

/** Local settings/runtime boundary only; no native connections or live configurations. */
describe("persisted optional server controls", () => {
  let directory: string;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "todu-server-settings-"));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(directory, { recursive: true });
  });
  function setup(env: NodeJS.ProcessEnv = {}, pending = false) {
    const configPath = path.join(directory, "config.yaml");
    const original =
      "# Keep comments\ndata_dir: ./data\nsync:\n  remote:\n    server: ws://server:3030 # Keep destination\n    enabled: false\n  listener:\n    enabled: true\n    bind: 127.0.0.1\ndaemon:\n  workers:\n    assigned: [recurring]\n  plugins:\n    config:\n      provider:\n        setting: keep\nunknown: keep\n";
    fs.writeFileSync(configPath, original);
    let settings: RemoteSyncSettings = { server: "ws://server:3030", enabled: false };
    let running = settings.enabled;
    const status = () => ({
      ...settings,
      running,
      state: "disconnected" as const,
    });
    const configure = vi.fn(async (input: unknown) => {
      const result = updateRemoteSyncSettings(settings, input);
      if (!result.ok) return result;
      settings = result.value;
      running = settings.enabled;
      return { ok: true as const, value: status() };
    });
    const start = vi.fn(async () => {
      running = true;
    });
    const stop = vi.fn(async () => {
      running = false;
    });
    const todu = {
      sync: { serverStatus: status, configureServer: configure, start, stop },
    } as unknown as Todu;
    const onConfigured = vi.fn();
    const runtime = createServerSettingsRuntime({
      configPath,
      initialSettings: settings,
      env,
      getTodu: () => (pending ? null : todu),
      isRunning: () => true,
      onConfigured,
    });
    const invoke = (input: unknown, requestedPath = configPath) =>
      runtime.handlers.sync!.serverConfigure(
        {
          id: "request",
          method: "sync.serverConfigure",
          params: { settings: input, configPath: requestedPath },
        },
        {} as DaemonRpcContext,
      );
    return { configPath, original, configure, onConfigured, invoke, status, start, stop };
  }
  it("persists live enable/disable while retaining comments, destination and unrelated local settings", async () => {
    const { invoke, configPath, original, status } = setup();
    expect(await invoke({ enabled: true })).toMatchObject({
      result: { enabled: true, running: true },
    });
    expect(await invoke({ enabled: false })).toMatchObject({
      result: { enabled: false, server: "ws://server:3030" },
    });
    const saved = fs.readFileSync(configPath, "utf8");
    expect(parse(saved)).toEqual(parse(original));
    expect(saved).toContain("# Keep comments");
    expect(saved).toContain("# Keep destination");
    expect(status().enabled).toBe(false);
    expect(fs.readdirSync(directory)).toEqual(["config.yaml"]);
  });
  it("repoints while retaining a disabled policy", async () => {
    const { invoke, configPath } = setup();
    expect(await invoke({ server: "ws://other:3030" })).toMatchObject({
      result: { enabled: false, server: "ws://other:3030" },
    });
    expect(parse(fs.readFileSync(configPath, "utf8")).sync.remote).toEqual({
      server: "ws://other:3030",
      enabled: false,
    });
  });
  it("refuses mismatched config context or environment overrides before changing file/runtime", async () => {
    const { invoke, original, configPath, configure } = setup({ TODU_SYNC_ENABLED: "false" });
    expect(await invoke({ enabled: true })).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    expect(await invoke({ enabled: true }, path.join(directory, "other.yaml"))).toMatchObject({
      error: { code: "PRECONDITION_FAILED" },
    });
    expect(configure).not.toHaveBeenCalled();
    expect(fs.readFileSync(configPath, "utf8")).toBe(original);
  });
  it("refuses invalid YAML without overwriting it", async () => {
    const { invoke, configPath, configure } = setup();
    fs.writeFileSync(configPath, "sync: [unterminated");
    expect(await invoke({ enabled: true })).toMatchObject({ error: { code: "INTERNAL_ERROR" } });
    expect(fs.readFileSync(configPath, "utf8")).toBe("sync: [unterminated");
    expect(configure).not.toHaveBeenCalled();
  });
  it("restores runtime on save failure and removes the staged file", async () => {
    const { invoke, configPath, original, status, configure } = setup();
    vi.spyOn(fs, "renameSync").mockImplementation(() => {
      throw new Error("Simulated save failure");
    });
    expect(await invoke({ enabled: true })).toMatchObject({
      error: { code: "INTERNAL_ERROR", message: expect.stringContaining("Simulated save failure") },
    });
    expect(configure).toHaveBeenCalledTimes(2);
    expect(status().enabled).toBe(false);
    expect(fs.readFileSync(configPath, "utf8")).toBe(original);
    expect(fs.readdirSync(directory)).toEqual(["config.yaml"]);
  });
  it("preserves a prior runtime-only start when persistence fails", async () => {
    const { invoke, status, start } = setup();
    await start();
    vi.spyOn(fs, "renameSync").mockImplementation(() => {
      throw new Error("Simulated save failure");
    });
    expect(await invoke({ enabled: false })).toMatchObject({ error: { code: "INTERNAL_ERROR" } });
    expect(status()).toMatchObject({ enabled: false, running: true });
  });
  it("preserves an existing config symlink and file permissions", async () => {
    const { invoke, configPath } = setup();
    const target = path.join(directory, "actual.yaml");
    fs.renameSync(configPath, target);
    fs.symlinkSync(target, configPath);
    fs.chmodSync(target, 0o660);
    const before = fs.statSync(target);
    expect(await invoke({ enabled: true })).toMatchObject({ result: { enabled: true } });
    expect(fs.lstatSync(configPath).isSymbolicLink()).toBe(true);
    const after = fs.statSync(target);
    expect(after.mode & 0o777).toBe(before.mode & 0o777);
    expect([after.uid, after.gid]).toEqual([before.uid, before.gid]);
  });
  it("does not replace a broken config symlink", async () => {
    const { invoke, configPath, configure } = setup();
    fs.unlinkSync(configPath);
    fs.symlinkSync(path.join(directory, "missing.yaml"), configPath);
    expect(await invoke({ enabled: true })).toMatchObject({ error: { code: "INTERNAL_ERROR" } });
    expect(configure).not.toHaveBeenCalled();
    expect(fs.lstatSync(configPath).isSymbolicLink()).toBe(true);
  });
  it("can save explicit local settings during pending startup without creating a dataset or connections", async () => {
    const { invoke, configure, onConfigured, configPath } = setup({}, true);
    expect(await invoke({ enabled: true })).toMatchObject({
      result: { enabled: true, running: false },
    });
    expect(configure).not.toHaveBeenCalled();
    expect(onConfigured).toHaveBeenCalledWith({ server: "ws://server:3030", enabled: true });
    expect(fs.readdirSync(directory)).toEqual([path.basename(configPath)]);
  });
});
