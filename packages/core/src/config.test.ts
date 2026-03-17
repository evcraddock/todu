import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG_DIR,
  DEFAULT_CONFIG_FILE,
  DEFAULT_DATA_DIR,
  LEGACY_DEFAULT_CONFIG_DIR,
  LEGACY_DEFAULT_CONFIG_FILE,
  LEGACY_DEFAULT_DATA_DIR,
  migrateLegacyDefaultConfigDirectory,
  normalizeConfigPaths,
  resolveConfigPath,
  resolveConfigSources,
  resolveDataDir,
  resolveRemoteSyncConfig,
  resolveStoragePath,
  TODU_CONFIG_ENV,
  TODU_DATA_DIR_ENV,
  TODU_SYNC_ENABLED_ENV,
  TODU_SYNC_SERVER_ENV,
  TODUAI_CONFIG_ENV,
  TODUAI_DATA_DIR_ENV,
  TODUAI_SYNC_ENABLED_ENV,
  TODUAI_SYNC_SERVER_ENV,
} from "./config.js";

describe("config resolution", () => {
  let tmpHome: string;
  const origEnv: Record<string, string | undefined> = {};
  const configEnvKeys = [
    TODU_CONFIG_ENV,
    TODUAI_CONFIG_ENV,
    TODU_DATA_DIR_ENV,
    TODUAI_DATA_DIR_ENV,
  ];

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "todu-core-config-test-"));

    for (const key of configEnvKeys) {
      origEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(origEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  describe("defaults", () => {
    it("DEFAULT_CONFIG_DIR is ~/.config/todu", () => {
      expect(DEFAULT_CONFIG_DIR).toBe(path.join(os.homedir(), ".config", "todu"));
    });

    it("DEFAULT_CONFIG_FILE is ~/.config/todu/config.yaml", () => {
      expect(DEFAULT_CONFIG_FILE).toBe(path.join(os.homedir(), ".config", "todu", "config.yaml"));
    });

    it("DEFAULT_DATA_DIR is ~/.config/todu/data", () => {
      expect(DEFAULT_DATA_DIR).toBe(path.join(os.homedir(), ".config", "todu", "data"));
    });

    it("retains exported legacy path constants for migration logic", () => {
      expect(LEGACY_DEFAULT_CONFIG_DIR).toBe(path.join(os.homedir(), ".config", "toduai"));
      expect(LEGACY_DEFAULT_CONFIG_FILE).toBe(
        path.join(os.homedir(), ".config", "toduai", "config.yaml"),
      );
      expect(LEGACY_DEFAULT_DATA_DIR).toBe(path.join(os.homedir(), ".config", "toduai", "data"));
    });
  });

  describe("resolveConfigPath", () => {
    it("uses override when provided", () => {
      expect(resolveConfigPath("/custom/config.yaml")).toBe("/custom/config.yaml");
    });

    it("uses TODU_CONFIG env var before legacy env var", () => {
      process.env[TODU_CONFIG_ENV] = "/env/current-config.yaml";
      process.env[TODUAI_CONFIG_ENV] = "/env/legacy-config.yaml";

      expect(resolveConfigPath()).toBe("/env/current-config.yaml");
    });

    it("falls back to legacy TODUAI_CONFIG env var", () => {
      process.env[TODUAI_CONFIG_ENV] = "/env/legacy-config.yaml";
      expect(resolveConfigPath()).toBe("/env/legacy-config.yaml");
    });

    it("falls back to the new default path", () => {
      expect(resolveConfigPath(undefined, { homeDir: tmpHome })).toBe(
        path.join(tmpHome, ".config", "todu", "config.yaml"),
      );
    });

    it("migrates default legacy config dir when legacy path exists and new path does not", () => {
      const legacyConfigDir = path.join(tmpHome, ".config", "toduai");
      const legacyConfigPath = path.join(legacyConfigDir, "config.yaml");
      const legacyPluginStatePath = path.join(
        legacyConfigDir,
        "data",
        "github-plugin-state",
        "state.json",
      );
      fs.mkdirSync(path.dirname(legacyPluginStatePath), { recursive: true });
      fs.writeFileSync(legacyConfigPath, "data_dir: ./data\n", "utf-8");
      fs.writeFileSync(legacyPluginStatePath, '{"ok":true}', "utf-8");

      const resolvedPath = resolveConfigPath(undefined, { homeDir: tmpHome });

      expect(resolvedPath).toBe(path.join(tmpHome, ".config", "todu", "config.yaml"));
      expect(
        fs.existsSync(
          path.join(tmpHome, ".config", "todu", "data", "github-plugin-state", "state.json"),
        ),
      ).toBe(true);
      expect(fs.existsSync(legacyConfigDir)).toBe(false);
    });

    it("prefers the new default path when both new and legacy config dirs exist", () => {
      const newConfigDir = path.join(tmpHome, ".config", "todu");
      const legacyConfigDir = path.join(tmpHome, ".config", "toduai");
      fs.mkdirSync(newConfigDir, { recursive: true });
      fs.mkdirSync(legacyConfigDir, { recursive: true });

      const resolvedPath = resolveConfigPath(undefined, { homeDir: tmpHome });

      expect(resolvedPath).toBe(path.join(newConfigDir, "config.yaml"));
      expect(fs.existsSync(legacyConfigDir)).toBe(true);
    });

    it("override beats env vars", () => {
      process.env[TODU_CONFIG_ENV] = "/env/current-config.yaml";
      process.env[TODUAI_CONFIG_ENV] = "/env/legacy-config.yaml";
      expect(resolveConfigPath("/override/config.yaml")).toBe("/override/config.yaml");
    });
  });

  describe("migrateLegacyDefaultConfigDirectory", () => {
    it("returns migrated=false when nothing needs migration", () => {
      const result = migrateLegacyDefaultConfigDirectory({ homeDir: tmpHome });

      expect(result).toEqual({
        migrated: false,
        configDir: path.join(tmpHome, ".config", "todu"),
        legacyConfigDir: path.join(tmpHome, ".config", "toduai"),
      });
    });
  });

  describe("normalizeConfigPaths", () => {
    it("rewrites embedded absolute legacy paths for migrated default config files", () => {
      const configPath = path.join(tmpHome, ".config", "todu", "config.yaml");
      const normalized = normalizeConfigPaths(
        {
          data_dir: path.join(tmpHome, ".config", "toduai", "data"),
          daemon: {
            plugins: {
              paths: [path.join(tmpHome, ".config", "toduai", "plugins", "github.js")],
              config: {
                github: {
                  cachePath: path.join(tmpHome, ".config", "toduai", "data", "github-cache.json"),
                },
              },
            },
          },
        },
        configPath,
        { homeDir: tmpHome },
      );

      expect(normalized).toEqual({
        data_dir: path.join(tmpHome, ".config", "todu", "data"),
        daemon: {
          plugins: {
            paths: [path.join(tmpHome, ".config", "todu", "plugins", "github.js")],
            config: {
              github: {
                cachePath: path.join(tmpHome, ".config", "todu", "data", "github-cache.json"),
              },
            },
          },
        },
      });
    });

    it("rewrites embedded absolute legacy paths for project-local config dirs", () => {
      const configPath = path.join(tmpHome, "workspace", ".todu", "config.yaml");
      const normalized = normalizeConfigPaths(
        {
          data_dir: path.join(tmpHome, "workspace", ".toduai", "data"),
        },
        configPath,
      );

      expect(normalized.data_dir).toBe(path.join(tmpHome, "workspace", ".todu", "data"));
    });
  });

  describe("resolveDataDir", () => {
    it("uses TODU_DATA_DIR env var first", () => {
      process.env[TODU_DATA_DIR_ENV] = "/env/current-data";
      process.env[TODUAI_DATA_DIR_ENV] = "/env/legacy-data";
      expect(resolveDataDir("/any/config.yaml", { data_dir: "./other" })).toBe("/env/current-data");
    });

    it("falls back to legacy TODUAI_DATA_DIR env var", () => {
      process.env[TODUAI_DATA_DIR_ENV] = "/env/legacy-data";
      expect(resolveDataDir("/any/config.yaml", { data_dir: "./other" })).toBe("/env/legacy-data");
    });

    it("resolves data_dir relative to config file", () => {
      expect(resolveDataDir("/home/user/.config/todu/config.yaml", { data_dir: "./data" })).toBe(
        "/home/user/.config/todu/data",
      );
    });

    it("normalizes embedded absolute legacy data_dir paths", () => {
      const configPath = path.join(tmpHome, ".config", "todu", "config.yaml");
      expect(
        resolveDataDir(
          configPath,
          {
            data_dir: path.join(tmpHome, ".config", "toduai", "data"),
          },
          { homeDir: tmpHome },
        ),
      ).toBe(path.join(tmpHome, ".config", "todu", "data"));
    });

    it("handles absolute data_dir", () => {
      expect(resolveDataDir("/any/config.yaml", { data_dir: "/absolute/path" })).toBe(
        "/absolute/path",
      );
    });

    it("falls back to the new default data dir when no config is set", () => {
      expect(resolveDataDir("/any/config.yaml", {}, { homeDir: tmpHome })).toBe(
        path.join(tmpHome, ".config", "todu", "data"),
      );
    });
  });

  describe("resolveStoragePath", () => {
    it("uses TODU_DATA_DIR env var", () => {
      process.env[TODU_DATA_DIR_ENV] = "/env/current-data";
      expect(resolveStoragePath()).toBe("/env/current-data");
    });

    it("falls back to legacy TODUAI_DATA_DIR env var", () => {
      process.env[TODUAI_DATA_DIR_ENV] = "/env/legacy-data";
      expect(resolveStoragePath()).toBe("/env/legacy-data");
    });

    it("falls back to migrated/default data dir", () => {
      expect(resolveStoragePath({ homeDir: tmpHome })).toBe(
        path.join(tmpHome, ".config", "todu", "data"),
      );
    });
  });

  describe("resolveConfigSources", () => {
    it("reports --config flag as source", () => {
      const sources = resolveConfigSources("/custom/config.yaml", { data_dir: "./mydata" });
      expect(sources.configSource).toBe("--config flag");
      expect(sources.dataDirSource).toContain("config file");
      expect(sources.dataDir).toBe("/custom/mydata");
    });

    it("reports TODU_CONFIG env var as source", () => {
      process.env[TODU_CONFIG_ENV] = "/env/current-config.yaml";
      const sources = resolveConfigSources();
      expect(sources.configSource).toBe("TODU_CONFIG env var");
    });

    it("reports legacy TODUAI_CONFIG env var as source", () => {
      process.env[TODUAI_CONFIG_ENV] = "/env/legacy-config.yaml";
      const sources = resolveConfigSources();
      expect(sources.configSource).toBe("TODUAI_CONFIG env var (legacy)");
    });

    it("reports TODU_DATA_DIR env var as source when set", () => {
      process.env[TODU_DATA_DIR_ENV] = "/override/current-data";
      const sources = resolveConfigSources();
      expect(sources.dataDirSource).toBe("TODU_DATA_DIR env var");
      expect(sources.dataDir).toBe("/override/current-data");
    });

    it("reports legacy TODUAI_DATA_DIR env var as source when set", () => {
      process.env[TODUAI_DATA_DIR_ENV] = "/override/legacy-data";
      const sources = resolveConfigSources();
      expect(sources.dataDirSource).toBe("TODUAI_DATA_DIR env var (legacy)");
      expect(sources.dataDir).toBe("/override/legacy-data");
    });

    it("reports default when nothing configured", () => {
      const sources = resolveConfigSources(undefined, {}, { homeDir: tmpHome });
      expect(sources.configSource).toBe("default");
      expect(sources.dataDirSource).toBe("default");
      expect(sources.dataDir).toBe(path.join(tmpHome, ".config", "todu", "data"));
    });
  });
});

describe("resolveRemoteSyncConfig", () => {
  const origEnv: Record<string, string | undefined> = {};
  const syncEnvKeys = [
    TODU_SYNC_SERVER_ENV,
    TODUAI_SYNC_SERVER_ENV,
    TODU_SYNC_ENABLED_ENV,
    TODUAI_SYNC_ENABLED_ENV,
  ];

  beforeEach(() => {
    for (const key of syncEnvKeys) {
      origEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(origEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("returns null when not configured", () => {
    expect(resolveRemoteSyncConfig({})).toBeNull();
  });

  it("returns null when server set but not enabled", () => {
    expect(
      resolveRemoteSyncConfig({
        sync: { remote: { server: "ws://localhost:3030", enabled: false } },
      }),
    ).toBeNull();
  });

  it("returns null when enabled but no server", () => {
    expect(resolveRemoteSyncConfig({ sync: { remote: { enabled: true } } })).toBeNull();
  });

  it("returns config when server set and enabled", () => {
    const result = resolveRemoteSyncConfig({
      sync: { remote: { server: "ws://localhost:3030", enabled: true } },
    });
    expect(result).toEqual({ server: "ws://localhost:3030" });
  });

  it("TODU_SYNC_SERVER overrides config file server", () => {
    process.env[TODU_SYNC_SERVER_ENV] = "ws://localhost:9999";
    const result = resolveRemoteSyncConfig({
      sync: { remote: { server: "ws://localhost:3030", enabled: true } },
    });
    expect(result).toEqual({ server: "ws://localhost:9999" });
  });

  it("falls back to legacy TODUAI_SYNC_SERVER", () => {
    process.env[TODUAI_SYNC_SERVER_ENV] = "ws://localhost:9999";
    const result = resolveRemoteSyncConfig({
      sync: { remote: { server: "ws://localhost:3030", enabled: true } },
    });
    expect(result).toEqual({ server: "ws://localhost:9999" });
  });

  it("TODU_SYNC_ENABLED=true enables sync", () => {
    process.env[TODU_SYNC_ENABLED_ENV] = "true";
    const result = resolveRemoteSyncConfig({
      sync: { remote: { server: "ws://localhost:3030" } },
    });
    expect(result).toEqual({ server: "ws://localhost:3030" });
  });

  it("TODU_SYNC_ENABLED=1 enables sync", () => {
    process.env[TODU_SYNC_ENABLED_ENV] = "1";
    const result = resolveRemoteSyncConfig({
      sync: { remote: { server: "ws://localhost:3030" } },
    });
    expect(result).toEqual({ server: "ws://localhost:3030" });
  });

  it("falls back to legacy TODUAI_SYNC_ENABLED", () => {
    process.env[TODUAI_SYNC_ENABLED_ENV] = "1";
    const result = resolveRemoteSyncConfig({
      sync: { remote: { server: "ws://localhost:3030" } },
    });
    expect(result).toEqual({ server: "ws://localhost:3030" });
  });

  it("TODU_SYNC_ENABLED=false disables sync even when config has enabled:true", () => {
    process.env[TODU_SYNC_ENABLED_ENV] = "false";
    const result = resolveRemoteSyncConfig({
      sync: { remote: { server: "ws://localhost:3030", enabled: true } },
    });
    expect(result).toBeNull();
  });
});
