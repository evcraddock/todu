import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveEnrollmentEndpoint, resolveSyncListenerConfig } from "@todu/core";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import { registerSyncCommands } from "./commands/sync.js";
import { loadConfig, saveSyncListenerConfig } from "./config.js";

describe("local listener configuration updates", () => {
  let directory: string;
  let configPath: string;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "todu-listener-config-"));
    configPath = path.join(directory, "config.yaml");
  });
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("persists a detected address via no-argument enablement and reuses it for enrollment without other settings changes", async () => {
    const original =
      "# Preserve operator comments\ndata_dir: ./data\nidentity:\n  ownerActor:\n    id: owner\n    displayName: Owner\nsync:\n  remote:\n    server: ws://existing.lan:3030 # Keep server\n    enabled: false\n  listener:\n    port: 24400 # Keep port\ndaemon:\n  workers:\n    assigned: [recurring]\n  plugins:\n    paths: [./provider.mjs]\n    config:\n      provider:\n        local_state: keep\nunknown: keep\n";
    fs.writeFileSync(configPath, original);
    vi.spyOn(os, "networkInterfaces").mockReturnValue({
      interface: [
        {
          address: "192.168.4.12",
          family: "IPv4",
          internal: false,
          netmask: "255.255.255.0",
          mac: "00:00:00:00:00:00",
          cidr: "192.168.4.12/24",
        },
      ],
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const invoke = vi.fn();
    const program = new Command()
      .option("--config <path>")
      .option("--format <type>", "output format", "json");
    registerSyncCommands(program, invoke);
    await program.parseAsync(["--config", configPath, "sync", "listener", "enable"], {
      from: "user",
    });
    const listener = { enabled: true, bind: "192.168.4.12", port: 24400 };
    expect(loadConfig(configPath)).toEqual({
      ...parse(original),
      sync: { ...parse(original).sync, listener },
    });
    const updated = fs.readFileSync(configPath, "utf-8");
    for (const comment of ["# Preserve operator comments", "# Keep server", "# Keep port"])
      expect(updated).toContain(comment);
    expect(resolveSyncListenerConfig(loadConfig(configPath).sync?.listener)).toEqual({
      ok: true,
      value: { bind: "192.168.4.12", port: 24400 },
    });
    expect(resolveEnrollmentEndpoint({ listener: loadConfig(configPath).sync?.listener })).toEqual({
      ok: true,
      value: "http://192.168.4.12:24400",
    });
    expect(JSON.parse(log.mock.calls[0][0] as string)).toMatchObject({
      listener,
      restartRequired: true,
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("patches only listener settings and preserves server, workers, provider settings, relative paths, and comments", () => {
    const original =
      "# Operator configuration\ndata_dir: ./data\nsync:\n  remote:\n    enabled: true\n    server: ws://existing.lan:3030 # Keep this server\ndaemon:\n  workers:\n    assigned: [recurring]\n  plugins:\n    paths: [./plugin.mjs]\n    config:\n      provider:\n        arbitrary_setting: keep\nunknown_future_setting: also-keep\n";
    fs.writeFileSync(configPath, original);
    saveSyncListenerConfig({ enabled: true, bind: "127.0.0.1", port: 24400 }, configPath);
    const updated = fs.readFileSync(configPath, "utf-8");
    expect(parse(updated)).toEqual({
      ...parse(original),
      sync: {
        ...parse(original).sync,
        listener: { enabled: true, bind: "127.0.0.1", port: 24400 },
      },
    });
    expect(updated).toContain("# Operator configuration");
    expect(updated).toContain("# Keep this server");
    saveSyncListenerConfig({ enabled: false }, configPath);
    expect(parse(fs.readFileSync(configPath, "utf-8")).sync.listener).toEqual({
      enabled: false,
      bind: "127.0.0.1",
      port: 24400,
    });
  });

  it("can create a missing local config without implicit server or worker settings", () => {
    saveSyncListenerConfig({ enabled: true, bind: "127.0.0.1", port: 24377 }, configPath);
    expect(parse(fs.readFileSync(configPath, "utf-8"))).toEqual({
      sync: { listener: { enabled: true, bind: "127.0.0.1", port: 24377 } },
    });
  });

  it.each([
    "sync: [unterminated",
    "- unexpected-root-list",
    "sync: not-a-mapping",
  ])("refuses malformed configuration without overwriting it: %s", (original) => {
    fs.writeFileSync(configPath, original);
    expect(() =>
      saveSyncListenerConfig({ enabled: true, bind: "127.0.0.1" }, configPath),
    ).toThrow();
    expect(fs.readFileSync(configPath, "utf-8")).toBe(original);
  });
});
