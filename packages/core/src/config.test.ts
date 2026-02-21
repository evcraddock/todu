import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG_DIR,
  DEFAULT_CONFIG_FILE,
  DEFAULT_DATA_DIR,
  resolveConfigPath,
  resolveConfigSources,
  resolveDataDir,
  resolveStoragePath,
} from "./config.js";

describe("config resolution", () => {
  const origEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ["TODUAI_CONFIG", "TODUAI_DATA_DIR"]) {
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

  describe("defaults", () => {
    it("DEFAULT_CONFIG_DIR is ~/.config/toduai", () => {
      expect(DEFAULT_CONFIG_DIR).toBe(path.join(os.homedir(), ".config", "toduai"));
    });

    it("DEFAULT_CONFIG_FILE is ~/.config/toduai/config.yaml", () => {
      expect(DEFAULT_CONFIG_FILE).toBe(path.join(os.homedir(), ".config", "toduai", "config.yaml"));
    });

    it("DEFAULT_DATA_DIR is ~/.config/toduai/data", () => {
      expect(DEFAULT_DATA_DIR).toBe(path.join(os.homedir(), ".config", "toduai", "data"));
    });
  });

  describe("resolveConfigPath", () => {
    it("uses override when provided", () => {
      expect(resolveConfigPath("/custom/config.yaml")).toBe("/custom/config.yaml");
    });

    it("uses TODUAI_CONFIG env var", () => {
      process.env.TODUAI_CONFIG = "/env/config.yaml";
      expect(resolveConfigPath()).toBe("/env/config.yaml");
    });

    it("falls back to default", () => {
      expect(resolveConfigPath()).toBe(DEFAULT_CONFIG_FILE);
    });

    it("override beats env var", () => {
      process.env.TODUAI_CONFIG = "/env/config.yaml";
      expect(resolveConfigPath("/override/config.yaml")).toBe("/override/config.yaml");
    });
  });

  describe("resolveDataDir", () => {
    it("uses TODUAI_DATA_DIR env var first", () => {
      process.env.TODUAI_DATA_DIR = "/env/data";
      expect(resolveDataDir("/any/config.yaml", { data_dir: "./other" })).toBe("/env/data");
    });

    it("resolves data_dir relative to config file", () => {
      expect(resolveDataDir("/home/user/.config/toduai/config.yaml", { data_dir: "./data" })).toBe(
        "/home/user/.config/toduai/data",
      );
    });

    it("handles absolute data_dir", () => {
      expect(resolveDataDir("/any/config.yaml", { data_dir: "/absolute/path" })).toBe(
        "/absolute/path",
      );
    });

    it("falls back to DEFAULT_DATA_DIR when no config", () => {
      expect(resolveDataDir("/any/config.yaml", {})).toBe(DEFAULT_DATA_DIR);
    });
  });

  describe("resolveStoragePath", () => {
    it("uses TODUAI_DATA_DIR env var", () => {
      process.env.TODUAI_DATA_DIR = "/env/data";
      expect(resolveStoragePath()).toBe("/env/data");
    });

    it("falls back to DEFAULT_DATA_DIR", () => {
      expect(resolveStoragePath()).toBe(DEFAULT_DATA_DIR);
    });
  });

  describe("resolveConfigSources", () => {
    it("reports --config flag as source", () => {
      const sources = resolveConfigSources("/custom/config.yaml", { data_dir: "./mydata" });
      expect(sources.configSource).toBe("--config flag");
      expect(sources.dataDirSource).toContain("config file");
      expect(sources.dataDir).toBe("/custom/mydata");
    });

    it("reports TODUAI_CONFIG env var as source", () => {
      process.env.TODUAI_CONFIG = "/env/config.yaml";
      const sources = resolveConfigSources();
      expect(sources.configSource).toBe("TODUAI_CONFIG env var");
    });

    it("reports TODUAI_DATA_DIR as source when set", () => {
      process.env.TODUAI_DATA_DIR = "/override/data";
      const sources = resolveConfigSources();
      expect(sources.dataDirSource).toBe("TODUAI_DATA_DIR env var");
      expect(sources.dataDir).toBe("/override/data");
    });

    it("reports default when nothing configured", () => {
      const sources = resolveConfigSources();
      expect(sources.configSource).toBe("default");
      expect(sources.dataDirSource).toBe("default");
      expect(sources.dataDir).toBe(DEFAULT_DATA_DIR);
    });
  });
});
