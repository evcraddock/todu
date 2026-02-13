import os from "node:os";
import path from "node:path";

// ============================================================================
// Shared configuration resolution
//
// Single source of truth for config and data directory paths.
// Used by CLI, Electron, and any future client.
//
// This module handles path resolution only. Config file parsing (YAML)
// stays in the CLI package which has the yaml dependency.
// ============================================================================

export const DEFAULT_CONFIG_DIR = path.join(os.homedir(), ".config", "todu");
export const DEFAULT_CONFIG_FILE = path.join(DEFAULT_CONFIG_DIR, "config.yaml");
export const DEFAULT_DATA_DIR = path.join(DEFAULT_CONFIG_DIR, "data");

export interface ToduFileConfig {
  /** Path to data directory (absolute or relative to config file) */
  data_dir?: string;
}

/**
 * Resolve config file path.
 *
 * Priority:
 * 1. Explicit override (e.g. --config flag)
 * 2. TODU_CONFIG env var
 * 3. Default: ~/.config/todu/config.yaml
 */
export function resolveConfigPath(override?: string): string {
  if (override) return path.resolve(override);
  if (process.env.TODU_CONFIG) return path.resolve(process.env.TODU_CONFIG);
  return DEFAULT_CONFIG_FILE;
}

/**
 * Resolve the data directory path.
 *
 * Priority:
 * 1. TODU_DATA_DIR env var (for tests / backward compat)
 * 2. data_dir from config file (resolved relative to config file location)
 * 3. Default: ~/.config/todu/data
 */
export function resolveDataDir(configPath: string, config: ToduFileConfig): string {
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
 * Useful for `todu config show` and debugging.
 */
export function resolveConfigSources(
  configOverride?: string,
  config?: ToduFileConfig,
): {
  configPath: string;
  configSource: string;
  dataDir: string;
  dataDirSource: string;
} {
  const configPath = resolveConfigPath(configOverride);
  let configSource: string;
  if (configOverride) {
    configSource = "--config flag";
  } else if (process.env.TODU_CONFIG) {
    configSource = "TODU_CONFIG env var";
  } else {
    configSource = "default";
  }

  const resolvedConfig = config ?? {};
  const dataDir = resolveDataDir(configPath, resolvedConfig);

  let dataDirSource: string;
  if (process.env.TODU_DATA_DIR) {
    dataDirSource = "TODU_DATA_DIR env var";
  } else if (resolvedConfig.data_dir) {
    dataDirSource = `config file (${configPath})`;
  } else {
    dataDirSource = "default";
  }

  return { configPath, configSource, dataDir, dataDirSource };
}

/**
 * Resolve storage path using env vars and defaults.
 *
 * For clients that don't parse config files (e.g. Electron).
 * Checks TODU_DATA_DIR env var, then falls back to default.
 * If a config file with data_dir is needed, use resolveDataDir instead.
 */
export function resolveStoragePath(): string {
  if (process.env.TODU_DATA_DIR) {
    return path.resolve(process.env.TODU_DATA_DIR);
  }
  return DEFAULT_DATA_DIR;
}
