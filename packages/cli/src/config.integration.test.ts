import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getConfigPath,
  loadConfig,
  resolveConfigSources,
  resolveDataDir,
  saveConfig,
} from "./config.js";

describe("config", () => {
  let tmpDir: string;
  const origEnv: Record<string, string | undefined> = {};
  const configEnvKeys = ["TODU_CONFIG", "TODUAI_CONFIG", "TODU_DATA_DIR", "TODUAI_DATA_DIR"];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-config-test-"));
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
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("getConfigPath", () => {
    it("uses override when provided", () => {
      const result = getConfigPath("/custom/config.yaml");
      expect(result).toBe("/custom/config.yaml");
    });

    it("uses TODU_CONFIG env var", () => {
      process.env.TODU_CONFIG = "/env/config.yaml";
      expect(getConfigPath()).toBe("/env/config.yaml");
    });

    it("falls back to legacy TODUAI_CONFIG env var", () => {
      process.env.TODUAI_CONFIG = "/env/legacy-config.yaml";
      expect(getConfigPath()).toBe("/env/legacy-config.yaml");
    });

    it("falls back to new default path", () => {
      const result = getConfigPath();
      expect(result).toContain(".config/todu/config.yaml");
    });

    it("override beats env vars", () => {
      process.env.TODU_CONFIG = "/env/config.yaml";
      process.env.TODUAI_CONFIG = "/env/legacy-config.yaml";
      expect(getConfigPath("/override/config.yaml")).toBe("/override/config.yaml");
    });
  });

  describe("loadConfig", () => {
    it("loads valid YAML config", () => {
      const configPath = path.join(tmpDir, "config.yaml");
      fs.writeFileSync(configPath, "data_dir: ./mydata\n");
      const config = loadConfig(configPath);
      expect(config.data_dir).toBe("./mydata");
    });

    it("returns empty config for missing file", () => {
      const config = loadConfig(path.join(tmpDir, "nonexistent.yaml"));
      expect(config).toEqual({});
    });

    it("returns empty config for empty file", () => {
      const configPath = path.join(tmpDir, "config.yaml");
      fs.writeFileSync(configPath, "");
      const config = loadConfig(configPath);
      expect(config).toEqual({});
    });

    it("throws on malformed YAML", () => {
      const configPath = path.join(tmpDir, "config.yaml");
      fs.writeFileSync(configPath, "data_dir: [invalid: yaml: {{{\n");
      expect(() => loadConfig(configPath)).toThrow();
    });

    it("normalizes embedded absolute legacy paths for .todu configs", () => {
      const configDir = path.join(tmpDir, ".todu");
      const configPath = path.join(configDir, "config.yaml");
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(
        configPath,
        `data_dir: ${JSON.stringify(path.join(tmpDir, ".toduai", "data"))}\n`,
        "utf-8",
      );

      const config = loadConfig(configPath);
      expect(config.data_dir).toBe(path.join(tmpDir, ".todu", "data"));
    });
  });

  describe("saveConfig", () => {
    it("creates config file with YAML content", () => {
      const configPath = path.join(tmpDir, "config.yaml");
      saveConfig({ data_dir: "./data" }, configPath);
      const content = fs.readFileSync(configPath, "utf-8");
      expect(content).toContain("data_dir");
      expect(content).toContain("./data");
    });

    it("creates parent directories", () => {
      const configPath = path.join(tmpDir, "nested", "deep", "config.yaml");
      saveConfig({ data_dir: "./data" }, configPath);
      expect(fs.existsSync(configPath)).toBe(true);
    });
  });

  describe("resolveDataDir", () => {
    it("uses TODU_DATA_DIR env var first", () => {
      process.env.TODU_DATA_DIR = "/env/data";
      process.env.TODUAI_DATA_DIR = "/env/legacy-data";
      const configPath = path.join(tmpDir, "config.yaml");
      const result = resolveDataDir(configPath, { data_dir: "./other" });
      expect(result).toBe("/env/data");
    });

    it("falls back to legacy TODUAI_DATA_DIR env var", () => {
      process.env.TODUAI_DATA_DIR = "/env/legacy-data";
      const configPath = path.join(tmpDir, "config.yaml");
      const result = resolveDataDir(configPath, { data_dir: "./other" });
      expect(result).toBe("/env/legacy-data");
    });

    it("resolves data_dir relative to config file", () => {
      const configPath = path.join(tmpDir, "config.yaml");
      const result = resolveDataDir(configPath, { data_dir: "./data" });
      expect(result).toBe(path.join(tmpDir, "data"));
    });

    it("handles absolute data_dir", () => {
      const configPath = path.join(tmpDir, "config.yaml");
      const result = resolveDataDir(configPath, { data_dir: "/absolute/path" });
      expect(result).toBe("/absolute/path");
    });

    it("falls back to new default when no config", () => {
      const configPath = path.join(tmpDir, "config.yaml");
      const result = resolveDataDir(configPath, {});
      expect(result).toContain(".config/todu/data");
    });
  });

  describe("resolveConfigSources", () => {
    it("reports --config flag as source", () => {
      const configPath = path.join(tmpDir, "config.yaml");
      fs.writeFileSync(configPath, "data_dir: ./mydata\n");
      const config = loadConfig(configPath);
      const sources = resolveConfigSources(configPath, config);
      expect(sources.configSource).toBe("--config flag");
      expect(sources.dataDirSource).toContain("config file");
      expect(sources.dataDir).toBe(path.join(tmpDir, "mydata"));
    });

    it("reports TODU_DATA_DIR as source when set", () => {
      process.env.TODU_DATA_DIR = "/override/data";
      const sources = resolveConfigSources();
      expect(sources.dataDirSource).toBe("TODU_DATA_DIR env var");
      expect(sources.dataDir).toBe("/override/data");
    });

    it("reports legacy TODUAI_DATA_DIR as source when set", () => {
      process.env.TODUAI_DATA_DIR = "/override/legacy-data";
      const sources = resolveConfigSources();
      expect(sources.dataDirSource).toBe("TODUAI_DATA_DIR env var (legacy)");
      expect(sources.dataDir).toBe("/override/legacy-data");
    });

    it("reports default when nothing configured", () => {
      const sources = resolveConfigSources();
      expect(sources.configSource).toBe("default");
      expect(sources.dataDirSource).toBe("default");
    });
  });
});
