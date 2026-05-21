import os from "node:os";
import path from "node:path";
import {
  type ActorId,
  createActorId,
  err,
  ok,
  type Result,
  type ValidationError,
} from "./types.js";
import { validateActorDisplayName, validateActorId } from "./validation.js";

const CURRENT_CONFIG_DIRNAME = "todu";

export const TODU_CONFIG_ENV = "TODU_CONFIG";
export const TODU_DATA_DIR_ENV = "TODU_DATA_DIR";
export const TODU_SYNC_SERVER_ENV = "TODU_SYNC_SERVER";
export const TODU_SYNC_ENABLED_ENV = "TODU_SYNC_ENABLED";

// ============================================================================
// Shared configuration resolution
//
// Single source of truth for config and data directory paths.
// Used by CLI, Electron, and any future client.
// ============================================================================

export function getDefaultConfigDir(homeDir: string = os.homedir()): string {
  return path.join(homeDir, ".config", CURRENT_CONFIG_DIRNAME);
}

export function getDefaultConfigFile(homeDir: string = os.homedir()): string {
  return path.join(getDefaultConfigDir(homeDir), "config.yaml");
}

export function getDefaultDataDir(homeDir: string = os.homedir()): string {
  return path.join(getDefaultConfigDir(homeDir), "data");
}

export const DEFAULT_CONFIG_DIR = getDefaultConfigDir();
export const DEFAULT_CONFIG_FILE = getDefaultConfigFile();
export const DEFAULT_DATA_DIR = getDefaultDataDir();

export interface BootstrapOwnerActor {
  id: ActorId;
  displayName: string;
}

export interface ToduFileConfig {
  /** Path to data directory (absolute or relative to config file) */
  data_dir?: string;
  /** Bootstrap identity for fresh catalog creation and pre-actor migration. */
  identity?: {
    ownerActor?: {
      id?: string;
      displayName?: string;
    };
  };
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

export interface ConfigResolutionOptions {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
}

export function resolveBootstrapOwnerActor(
  config: ToduFileConfig,
): Result<BootstrapOwnerActor | null, ValidationError> {
  const configuredOwner = config.identity?.ownerActor;
  if (!configuredOwner) {
    return ok(null);
  }

  const actorIdError = validateActorId("identity.ownerActor.id", configuredOwner.id ?? "");
  if (actorIdError) {
    return err(actorIdError);
  }

  const displayNameError = validateActorDisplayName(
    "identity.ownerActor.displayName",
    configuredOwner.displayName ?? "",
  );
  if (displayNameError) {
    return err(displayNameError);
  }

  return ok({
    id: createActorId(configuredOwner.id!.trim()),
    displayName: configuredOwner.displayName!.trim(),
  });
}

/**
 * Resolve remote sync configuration from file config and env var overrides.
 *
 * Priority:
 * 1. TODU_SYNC_SERVER / TODU_SYNC_ENABLED env vars
 * 2. sync.remote fields from config file
 *
 * Returns null when remote sync is disabled or not configured.
 *
 * IMPORTANT: Never use wss://sync.todu.sh in development or tests.
 * Use the local dev sync server (ws://localhost:3030) via `make dev`.
 */
export function resolveRemoteSyncConfig(
  config: ToduFileConfig,
  options: ConfigResolutionOptions = {},
): RemoteSyncConfig | null {
  const env = options.env ?? process.env;
  const serverEnv = resolveEnvValue(env, TODU_SYNC_SERVER_ENV);
  const enabledEnv = resolveEnvValue(env, TODU_SYNC_ENABLED_ENV);

  const server = serverEnv ?? config.sync?.remote?.server;

  // Default enabled to true when a server is configured — if someone
  // sets a sync server URL, they obviously want sync enabled.
  const enabled =
    enabledEnv !== null
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
 * 2. TODU_CONFIG env var
 * 3. Default: ~/.config/todu/config.yaml
 */
export function resolveConfigPath(
  override?: string,
  options: ConfigResolutionOptions = {},
): string {
  if (override) return path.resolve(override);

  const env = options.env ?? process.env;
  const configEnv = resolveEnvValue(env, TODU_CONFIG_ENV);
  if (configEnv !== null) {
    return path.resolve(configEnv);
  }

  return getDefaultConfigFile(options.homeDir ?? os.homedir());
}

/**
 * Resolve the data directory path.
 *
 * Priority:
 * 1. TODU_DATA_DIR env var
 * 2. data_dir from config file (resolved relative to config file location)
 * 3. Default: ~/.config/todu/data
 */
export function resolveDataDir(
  configPath: string,
  config: ToduFileConfig,
  options: ConfigResolutionOptions = {},
): string {
  const env = options.env ?? process.env;
  const homeDir = options.homeDir ?? os.homedir();

  const dataDirEnv = resolveEnvValue(env, TODU_DATA_DIR_ENV);
  if (dataDirEnv !== null) {
    return path.resolve(dataDirEnv);
  }

  if (config.data_dir) {
    const configDir = path.dirname(path.resolve(configPath));
    return path.resolve(configDir, config.data_dir);
  }

  return getDefaultDataDir(homeDir);
}

export function normalizeConfigPaths(
  config: ToduFileConfig,
  _configPath?: string,
  _options: ConfigResolutionOptions = {},
): ToduFileConfig {
  return config;
}

/**
 * Describe where each resolved value came from.
 * Useful for `todu config show` and debugging.
 */
export function resolveConfigSources(
  configOverride?: string,
  config?: ToduFileConfig,
  options: ConfigResolutionOptions = {},
): {
  configPath: string;
  configSource: string;
  dataDir: string;
  dataDirSource: string;
} {
  const env = options.env ?? process.env;
  const configPath = resolveConfigPath(configOverride, options);

  let configSource: string;
  if (configOverride) {
    configSource = "--config flag";
  } else if (resolveEnvValue(env, TODU_CONFIG_ENV) !== null) {
    configSource = `${TODU_CONFIG_ENV} env var`;
  } else {
    configSource = "default";
  }

  const resolvedConfig = normalizeConfigPaths(config ?? {});
  const dataDir = resolveDataDir(configPath, resolvedConfig, options);

  let dataDirSource: string;
  if (resolveEnvValue(env, TODU_DATA_DIR_ENV) !== null) {
    dataDirSource = `${TODU_DATA_DIR_ENV} env var`;
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
 * For clients that don't parse config files.
 */
export function resolveStoragePath(options: ConfigResolutionOptions = {}): string {
  const env = options.env ?? process.env;

  const dataDirEnv = resolveEnvValue(env, TODU_DATA_DIR_ENV);
  if (dataDirEnv !== null) {
    return path.resolve(dataDirEnv);
  }

  return getDefaultDataDir(options.homeDir ?? os.homedir());
}

function resolveEnvValue(env: NodeJS.ProcessEnv, name: string): string | null {
  const value = env[name];
  if (value !== undefined && value.trim().length > 0) {
    return value;
  }

  return null;
}
