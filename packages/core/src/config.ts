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

export const DEFAULT_CONFIG_DIR = path.join(os.homedir(), ".config", "toduai");
export const DEFAULT_CONFIG_FILE = path.join(DEFAULT_CONFIG_DIR, "config.yaml");
export const DEFAULT_DATA_DIR = path.join(DEFAULT_CONFIG_DIR, "data");

export interface ToduFileConfig {
  /** Path to data directory (absolute or relative to config file) */
  data_dir?: string;
  /** Remote multi-device sync configuration */
  sync?: {
    remote?: {
      /** WebSocket URL of the remote sync server (e.g. "wss://sync.todu.sh") */
      server?: string;
      /** Whether remote sync is enabled (default: false) */
      enabled?: boolean;
    };
  };
  /** Daemon-specific configuration */
  daemon?: {
    workers?: {
      /** Worker types statically assigned to this daemon */
      assigned?: string[];
    };
    plugins?: {
      /** Local plugin module entrypoints for daemon startup loading */
      paths?: string[];
      /** Arbitrary plugin settings keyed by plugin name */
      config?: Record<string, Record<string, unknown>>;
    };
  };
}

/** Resolved remote sync config — only present when server is set and enabled. */
export interface RemoteSyncConfig {
  /** WebSocket URL of the remote sync server */
  server: string;
}

/**
 * Resolve remote sync configuration from file config and env var overrides.
 *
 * Priority:
 * 1. TODUAI_SYNC_SERVER / TODUAI_SYNC_ENABLED env vars
 * 2. sync.remote fields from config file
 *
 * Returns null when remote sync is disabled or not configured.
 *
 * IMPORTANT: Never use wss://sync.todu.sh in development or tests.
 * Use the local dev sync server (ws://localhost:3030) via `make dev`.
 */
export function resolveRemoteSyncConfig(config: ToduFileConfig): RemoteSyncConfig | null {
  const serverEnv = process.env.TODUAI_SYNC_SERVER;
  const enabledEnv = process.env.TODUAI_SYNC_ENABLED;

  const server = serverEnv ?? config.sync?.remote?.server;

  // Default enabled to true when a server is configured — if someone
  // sets a sync server URL, they obviously want sync enabled.
  const enabled =
    enabledEnv !== undefined
      ? enabledEnv === "true" || enabledEnv === "1"
      : (config.sync?.remote?.enabled ?? true);

  if (!server || !enabled) return null;

  return { server };
}

/**
 * Resolve config file path.
 *
 * Priority:
 * 1. Explicit override (e.g. --config flag)
 * 2. TODUAI_CONFIG env var
 * 3. Default: ~/.config/toduai/config.yaml
 */
export function resolveConfigPath(override?: string): string {
  if (override) return path.resolve(override);
  if (process.env.TODUAI_CONFIG) return path.resolve(process.env.TODUAI_CONFIG);
  return DEFAULT_CONFIG_FILE;
}

/**
 * Resolve the data directory path.
 *
 * Priority:
 * 1. TODUAI_DATA_DIR env var
 * 2. data_dir from config file (resolved relative to config file location)
 * 3. Default: ~/.config/toduai/data
 */
export function resolveDataDir(configPath: string, config: ToduFileConfig): string {
  // Env var takes precedence (tests, explicit override)
  if (process.env.TODUAI_DATA_DIR) {
    return path.resolve(process.env.TODUAI_DATA_DIR);
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
 * Useful for `toduai config show` and debugging.
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
  } else if (process.env.TODUAI_CONFIG) {
    configSource = "TODUAI_CONFIG env var";
  } else {
    configSource = "default";
  }

  const resolvedConfig = config ?? {};
  const dataDir = resolveDataDir(configPath, resolvedConfig);

  let dataDirSource: string;
  if (process.env.TODUAI_DATA_DIR) {
    dataDirSource = "TODUAI_DATA_DIR env var";
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
 * Checks TODUAI_DATA_DIR env var, then falls back to default.
 * If a config file with data_dir is needed, use resolveDataDir instead.
 */
export function resolveStoragePath(): string {
  if (process.env.TODUAI_DATA_DIR) {
    return path.resolve(process.env.TODUAI_DATA_DIR);
  }
  return DEFAULT_DATA_DIR;
}
