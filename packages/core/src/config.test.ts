import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG_DIR,
  DEFAULT_CONFIG_FILE,
  DEFAULT_DATA_DIR,
  normalizeConfigPaths,
  resolveBootstrapOwnerActor,
  resolveConfigPath,
  resolveConfigSources,
  resolveDataDir,
  resolveRemoteSyncConfig,
  resolveStoragePath,
  TODU_CONFIG_ENV,
  TODU_DATA_DIR_ENV,
  TODU_SYNC_ENABLED_ENV,
  TODU_SYNC_SERVER_ENV,
} from "./config.js";

describe("config resolution", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env[TODU_CONFIG_ENV];
    delete process.env[TODU_DATA_DIR_ENV];
    delete process.env[TODU_SYNC_SERVER_ENV];
    delete process.env[TODU_SYNC_ENABLED_ENV];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("defaults", () => {
    it("uses ~/.config/todu paths", () => {
      expect(DEFAULT_CONFIG_DIR).toBe(path.join(os.homedir(), ".config", "todu"));
      expect(DEFAULT_CONFIG_FILE).toBe(path.join(os.homedir(), ".config", "todu", "config.yaml"));
      expect(DEFAULT_DATA_DIR).toBe(path.join(os.homedir(), ".config", "todu", "data"));
    });
  });

  describe("resolveConfigPath", () => {
    it("uses override when provided", () => {
      process.env[TODU_CONFIG_ENV] = "/env/config.yaml";
      expect(resolveConfigPath("./custom.yaml")).toBe(path.resolve("./custom.yaml"));
    });

    it("uses TODU_CONFIG env var", () => {
      process.env[TODU_CONFIG_ENV] = "/env/config.yaml";
      expect(resolveConfigPath()).toBe("/env/config.yaml");
    });

    it("falls back to the default path", () => {
      expect(resolveConfigPath(undefined, { homeDir: "/tmp/home" })).toBe(
        "/tmp/home/.config/todu/config.yaml",
      );
    });
  });

  describe("normalizeConfigPaths", () => {
    it("returns config unchanged", () => {
      const config = { data_dir: "./data" };
      expect(normalizeConfigPaths(config)).toBe(config);
    });
  });

  describe("resolveBootstrapOwnerActor", () => {
    it("returns null when owner bootstrap config is absent", () => {
      expect(resolveBootstrapOwnerActor({})).toEqual({ ok: true, value: null });
    });

    it("returns trimmed owner bootstrap config when present", () => {
      expect(
        resolveBootstrapOwnerActor({
          identity: {
            ownerActor: {
              id: " erik ",
              displayName: " Erik ",
            },
          },
        }),
      ).toEqual({ ok: true, value: { id: "erik", displayName: "Erik" } });
    });

    it("rejects missing owner actor id", () => {
      const result = resolveBootstrapOwnerActor({
        identity: { ownerActor: { displayName: "Erik" } },
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.field).toBe("identity.ownerActor.id");
      }
    });

    it("rejects missing owner actor display name", () => {
      const result = resolveBootstrapOwnerActor({ identity: { ownerActor: { id: "erik" } } });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.field).toBe("identity.ownerActor.displayName");
      }
    });
  });

  describe("resolveDataDir", () => {
    it("uses TODU_DATA_DIR env var", () => {
      process.env[TODU_DATA_DIR_ENV] = "/env/data";
      expect(resolveDataDir("/any/config.yaml", { data_dir: "./other" })).toBe("/env/data");
    });

    it("resolves data_dir relative to config file", () => {
      expect(resolveDataDir("/tmp/project/.todu/config.yaml", { data_dir: "./data" })).toBe(
        "/tmp/project/.todu/data",
      );
    });

    it("handles absolute data_dir", () => {
      expect(resolveDataDir("/tmp/project/.todu/config.yaml", { data_dir: "/var/todu" })).toBe(
        "/var/todu",
      );
    });

    it("falls back to the default data dir", () => {
      expect(resolveDataDir("/any/config.yaml", {}, { homeDir: "/tmp/home" })).toBe(
        "/tmp/home/.config/todu/data",
      );
    });
  });

  describe("resolveStoragePath", () => {
    it("uses TODU_DATA_DIR env var", () => {
      process.env[TODU_DATA_DIR_ENV] = "/env/data";
      expect(resolveStoragePath()).toBe("/env/data");
    });

    it("falls back to default data dir", () => {
      expect(resolveStoragePath({ homeDir: "/tmp/home" })).toBe("/tmp/home/.config/todu/data");
    });
  });

  describe("resolveConfigSources", () => {
    it("reports --config flag as source", () => {
      const sources = resolveConfigSources("/custom/config.yaml", { data_dir: "./data" });
      expect(sources.configSource).toBe("--config flag");
      expect(sources.configPath).toBe("/custom/config.yaml");
    });

    it("reports TODU_CONFIG env var as source", () => {
      process.env[TODU_CONFIG_ENV] = "/env/config.yaml";
      const sources = resolveConfigSources();
      expect(sources.configSource).toBe("TODU_CONFIG env var");
      expect(sources.configPath).toBe("/env/config.yaml");
    });

    it("reports TODU_DATA_DIR env var as source", () => {
      process.env[TODU_DATA_DIR_ENV] = "/override/data";
      const sources = resolveConfigSources();
      expect(sources.dataDirSource).toBe("TODU_DATA_DIR env var");
      expect(sources.dataDir).toBe("/override/data");
    });

    it("reports default when nothing configured", () => {
      const sources = resolveConfigSources(undefined, {}, { homeDir: "/tmp/home" });
      expect(sources.configSource).toBe("default");
      expect(sources.dataDirSource).toBe("default");
      expect(sources.configPath).toBe("/tmp/home/.config/todu/config.yaml");
      expect(sources.dataDir).toBe("/tmp/home/.config/todu/data");
    });
  });
});

describe("resolveRemoteSyncConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env[TODU_SYNC_SERVER_ENV];
    delete process.env[TODU_SYNC_ENABLED_ENV];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns null when not configured", () => {
    expect(resolveRemoteSyncConfig({})).toBeNull();
  });

  it("returns null when server set but disabled", () => {
    expect(
      resolveRemoteSyncConfig({
        sync: { remote: { server: "ws://localhost:3030", enabled: false } },
      }),
    ).toBeNull();
  });

  it("returns config when server set and enabled", () => {
    expect(
      resolveRemoteSyncConfig({
        sync: { remote: { server: "ws://localhost:3030", enabled: true } },
      }),
    ).toEqual({ server: "ws://localhost:3030" });
  });

  it("TODU_SYNC_SERVER overrides config file server", () => {
    process.env[TODU_SYNC_SERVER_ENV] = "ws://localhost:9999";
    expect(
      resolveRemoteSyncConfig({ sync: { remote: { server: "ws://localhost:3030" } } }),
    ).toEqual({ server: "ws://localhost:9999" });
  });

  it("TODU_SYNC_ENABLED=true enables sync", () => {
    process.env[TODU_SYNC_SERVER_ENV] = "ws://localhost:9999";
    process.env[TODU_SYNC_ENABLED_ENV] = "true";
    expect(resolveRemoteSyncConfig({})).toEqual({ server: "ws://localhost:9999" });
  });

  it("TODU_SYNC_ENABLED=false disables sync", () => {
    process.env[TODU_SYNC_ENABLED_ENV] = "false";
    expect(
      resolveRemoteSyncConfig({ sync: { remote: { server: "ws://localhost:3030" } } }),
    ).toBeNull();
  });
});
