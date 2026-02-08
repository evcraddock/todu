import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse, stringify } from "yaml";

// ============================================================================
// Configuration
// ============================================================================

export interface ToduConfig {
  /** Path to data directory (absolute or relative to config file) */
  data_dir?: string;
}

const DEFAULT_CONFIG_DIR = path.join(os.homedir(), ".config", "todu");
const DEFAULT_CONFIG_FILE = path.join(DEFAULT_CONFIG_DIR, "config.yaml");
const DEFAULT_DATA_DIR = path.join(DEFAULT_CONFIG_DIR, "data");

/**
 * Resolve config file path:
 * 1. Explicit --config flag
 * 2. TODU_CONFIG env var
 * 3. Default: ~/.config/todu/config.yaml
 */
export function getConfigPath(override?: string): string {
  if (override) return path.resolve(override);
  if (process.env.TODU_CONFIG) return path.resolve(process.env.TODU_CONFIG);
  return DEFAULT_CONFIG_FILE;
}

/**
 * Load config from YAML file. Returns empty config if file doesn't exist.
 * Throws on malformed YAML so users know their config is broken.
 */
export function loadConfig(configPath: string): ToduConfig {
  let content: string;
  try {
    content = fs.readFileSync(configPath, "utf-8");
  } catch {
    return {}; // File not found — that's fine
  }
  // Let YAML parse errors surface
  return (parse(content) as ToduConfig) ?? {};
}

/**
 * Save config to YAML file. Creates directory if needed.
 */
export function saveConfig(config: ToduConfig, configPath: string): void {
  const dir = path.dirname(configPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath, stringify(config), "utf-8");
}

/**
 * Resolve the data directory path.
 *
 * Priority:
 * 1. TODU_DATA_DIR env var (for tests / backward compat)
 * 2. data_dir from config file (resolved relative to config file location)
 * 3. Default: ~/.config/todu/data
 */
export function resolveDataDir(configPath: string, config: ToduConfig): string {
  // Env var takes precedence (backward compat, tests)
  if (process.env.TODU_DATA_DIR) {
    return path.resolve(process.env.TODU_DATA_DIR);
  }

  // Config file data_dir
  if (config.data_dir) {
    const configDir = path.dirname(configPath);
    return path.resolve(configDir, config.data_dir);
  }

  // Default
  return DEFAULT_DATA_DIR;
}

/**
 * Describe where each resolved value came from.
 */
export function resolveConfigSources(configOverride?: string): {
  configPath: string;
  configSource: string;
  dataDir: string;
  dataDirSource: string;
} {
  const configPath = getConfigPath(configOverride);
  let configSource: string;
  if (configOverride) {
    configSource = "--config flag";
  } else if (process.env.TODU_CONFIG) {
    configSource = "TODU_CONFIG env var";
  } else {
    configSource = "default";
  }

  const config = loadConfig(configPath);
  const dataDir = resolveDataDir(configPath, config);

  let dataDirSource: string;
  if (process.env.TODU_DATA_DIR) {
    dataDirSource = "TODU_DATA_DIR env var";
  } else if (config.data_dir) {
    dataDirSource = `config file (${configPath})`;
  } else {
    dataDirSource = "default";
  }

  return { configPath, configSource, dataDir, dataDirSource };
}
