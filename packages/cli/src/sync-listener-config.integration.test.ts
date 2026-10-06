import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { saveSyncListenerConfig } from "./config.js";

describe("local listener configuration updates", () => {
  let directory: string;
  let configPath: string;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "todu-listener-config-"));
    configPath = path.join(directory, "config.yaml");
  });
  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
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
