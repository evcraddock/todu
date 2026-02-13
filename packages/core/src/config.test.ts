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
    for (const key of ["TODU_CONFIG", "TODU_DATA_DIR"]) {
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
    it("DEFAULT_CONFIG_DIR is ~/.config/todu", () => {
      expect(DEFAULT_CONFIG_DIR).toBe(path.join(os.homedir(), ".config", "todu"));
    });

    it("DEFAULT_CONFIG_FILE is ~/.config/todu/config.yaml", () => {
      expect(DEFAULT_CONFIG_FILE).toBe(path.join(os.homedir(), ".config", "todu", "config.yaml"));
    });

    it("DEFAULT_DATA_DIR is ~/.config/todu/data", () => {
      expect(DEFAULT_DATA_DIR).toBe(path.join(os.homedir(), ".config", "todu", "data"));
    });
  });

  describe("resolveConfigPath", () => {
    it("uses override when provided", () => {
      expect(resolveConfigPath("/custom/config.yaml")).toBe("/custom/config.yaml");
    });

    it("uses TODU_CONFIG env var", () => {
      process.env.TODU_CONFIG = "/env/config.yaml";
      expect(resolveConfigPath()).toBe("/env/config.yaml");
    });

    it("falls back to default", () => {
      expect(resolveConfigPath()).toBe(DEFAULT_CONFIG_FILE);
    });

    it("override beats env var", () => {
      process.env.TODU_CONFIG = "/env/config.yaml";
      expect(resolveConfigPath("/override/config.yaml")).toBe("/override/config.yaml");
    });
  });

  describe("resolveDataDir", () => {
    it("uses TODU_DATA_DIR env var first", () => {
      process.env.TODU_DATA_DIR = "/env/data";
      expect(resolveDataDir("/any/config.yaml", { data_dir: "./other" })).toBe("/env/data");
    });

    it("resolves data_dir relative to config file", () => {
      expect(resolveDataDir("/home/user/.config/todu/config.yaml", { data_dir: "./data" })).toBe(
        "/home/user/.config/todu/data",
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
    it("uses TODU_DATA_DIR env var", () => {
      process.env.TODU_DATA_DIR = "/env/data";
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

    it("reports TODU_CONFIG env var as source", () => {
      process.env.TODU_CONFIG = "/env/config.yaml";
      const sources = resolveConfigSources();
      expect(sources.configSource).toBe("TODU_CONFIG env var");
    });

    it("reports TODU_DATA_DIR as source when set", () => {
      process.env.TODU_DATA_DIR = "/override/data";
      const sources = resolveConfigSources();
      expect(sources.dataDirSource).toBe("TODU_DATA_DIR env var");
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
