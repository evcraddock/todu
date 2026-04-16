import fs from "node:fs";
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
const LEGACY_CONFIG_DIRNAME = "toduai";
const CURRENT_PROJECT_CONFIG_DIRNAME = ".todu";
const LEGACY_PROJECT_CONFIG_DIRNAME = ".toduai";

export const TODU_CONFIG_ENV = "TODU_CONFIG";
export const TODUAI_CONFIG_ENV = "TODUAI_CONFIG";
export const TODU_DATA_DIR_ENV = "TODU_DATA_DIR";
export const TODUAI_DATA_DIR_ENV = "TODUAI_DATA_DIR";
export const TODU_SYNC_SERVER_ENV = "TODU_SYNC_SERVER";
export const TODUAI_SYNC_SERVER_ENV = "TODUAI_SYNC_SERVER";
export const TODU_SYNC_ENABLED_ENV = "TODU_SYNC_ENABLED";
export const TODUAI_SYNC_ENABLED_ENV = "TODUAI_SYNC_ENABLED";

// ============================================================================
// Shared configuration resolution
//
// Single source of truth for config and data directory paths.
// Used by CLI, Electron, and any future client.
//
// This module handles path resolution plus legacy-to-current migration-aware
// normalization. Config file parsing (YAML) stays in the CLI/Electron packages.
// ============================================================================

export function getDefaultConfigDir(homeDir: string = os.homedir()): string {
  return path.join(homeDir, ".config", CURRENT_CONFIG_DIRNAME);
}

export function getLegacyDefaultConfigDir(homeDir: string = os.homedir()): string {
  return path.join(homeDir, ".config", LEGACY_CONFIG_DIRNAME);
}

export function getDefaultConfigFile(homeDir: string = os.homedir()): string {
  return path.join(getDefaultConfigDir(homeDir), "config.yaml");
}

export function getLegacyDefaultConfigFile(homeDir: string = os.homedir()): string {
  return path.join(getLegacyDefaultConfigDir(homeDir), "config.yaml");
}

export function getDefaultDataDir(homeDir: string = os.homedir()): string {
  return path.join(getDefaultConfigDir(homeDir), "data");
}

export function getLegacyDefaultDataDir(homeDir: string = os.homedir()): string {
  return path.join(getLegacyDefaultConfigDir(homeDir), "data");
}

export const DEFAULT_CONFIG_DIR = getDefaultConfigDir();
export const DEFAULT_CONFIG_FILE = getDefaultConfigFile();
export const DEFAULT_DATA_DIR = getDefaultDataDir();
export const LEGACY_DEFAULT_CONFIG_DIR = getLegacyDefaultConfigDir();
export const LEGACY_DEFAULT_CONFIG_FILE = getLegacyDefaultConfigFile();
export const LEGACY_DEFAULT_DATA_DIR = getLegacyDefaultDataDir();

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

export interface LegacyConfigMigrationResult {
  migrated: boolean;
  configDir: string;
  legacyConfigDir: string;
}

interface ResolvedEnvValue {
  value: string;
  source: string;
  legacy: boolean;
}

/**
 * Resolve remote sync configuration from file config and env var overrides.
 *
 * Priority:
 * 1. TODU_SYNC_SERVER / TODU_SYNC_ENABLED env vars
 * 2. Legacy TODUAI_SYNC_SERVER / TODUAI_SYNC_ENABLED env vars
 * 3. sync.remote fields from config file
 *
 * Returns null when remote sync is disabled or not configured.
 *
 * IMPORTANT: Never use wss://sync.todu.sh in development or tests.
 * Use the local dev sync server (ws://localhost:3030) via `make dev`.
 */
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

export function resolveRemoteSyncConfig(
  config: ToduFileConfig,
  options: ConfigResolutionOptions = {},
): RemoteSyncConfig | null {
  const env = options.env ?? process.env;
  const serverEnv = resolvePreferredEnvValue(env, TODU_SYNC_SERVER_ENV, TODUAI_SYNC_SERVER_ENV);
  const enabledEnv = resolvePreferredEnvValue(env, TODU_SYNC_ENABLED_ENV, TODUAI_SYNC_ENABLED_ENV);

  const server = serverEnv?.value ?? config.sync?.remote?.server;

  // Default enabled to true when a server is configured — if someone
  // sets a sync server URL, they obviously want sync enabled.
  const enabled =
    enabledEnv !== null
      ? enabledEnv.value === "true" || enabledEnv.value === "1"
      : (config.sync?.remote?.enabled ?? true);

  if (!server || !enabled) return null;

  return { server };
}

/**
 * Migrate the default legacy config directory (`~/.config/toduai`) to the
 * current default (`~/.config/todu`) when the current path does not exist yet.
 *
 * This is intentionally narrow: explicit override paths and explicit env var
 * overrides are not moved automatically.
 */
export function migrateLegacyDefaultConfigDirectory(
  options: ConfigResolutionOptions = {},
): LegacyConfigMigrationResult {
  const homeDir = options.homeDir ?? os.homedir();
  const configDir = getDefaultConfigDir(homeDir);
  const legacyConfigDir = getLegacyDefaultConfigDir(homeDir);

  if (fs.existsSync(configDir) || !fs.existsSync(legacyConfigDir)) {
    return {
      migrated: false,
      configDir,
      legacyConfigDir,
    };
  }

  fs.mkdirSync(path.dirname(configDir), { recursive: true });
  fs.renameSync(legacyConfigDir, configDir);

  return {
    migrated: true,
    configDir,
    legacyConfigDir,
  };
}

/**
 * Resolve config file path.
 *
 * Priority:
 * 1. Explicit override (e.g. --config flag)
 * 2. TODU_CONFIG env var
 * 3. Legacy TODUAI_CONFIG env var
 * 4. Default: ~/.config/todu/config.yaml (after one-time migration from legacy
 *    default path when needed)
 */
export function resolveConfigPath(
  override?: string,
  options: ConfigResolutionOptions = {},
): string {
  if (override) return path.resolve(override);

  const env = options.env ?? process.env;
  const configEnv = resolvePreferredEnvValue(env, TODU_CONFIG_ENV, TODUAI_CONFIG_ENV);
  if (configEnv !== null) {
    return path.resolve(configEnv.value);
  }

  const migration = migrateLegacyDefaultConfigDirectory(options);
  return path.join(migration.configDir, "config.yaml");
}

/**
 * Resolve the data directory path.
 *
 * Priority:
 * 1. TODU_DATA_DIR env var
 * 2. Legacy TODUAI_DATA_DIR env var
 * 3. data_dir from config file (resolved relative to config file location)
 * 4. Default: ~/.config/todu/data
 */
export function resolveDataDir(
  configPath: string,
  config: ToduFileConfig,
  options: ConfigResolutionOptions = {},
): string {
  const env = options.env ?? process.env;
  const homeDir = options.homeDir ?? os.homedir();

  const dataDirEnv = resolvePreferredEnvValue(env, TODU_DATA_DIR_ENV, TODUAI_DATA_DIR_ENV);
  if (dataDirEnv !== null) {
    return path.resolve(dataDirEnv.value);
  }

  const normalizedConfig = normalizeConfigPaths(config, configPath, options);

  if (normalizedConfig.data_dir) {
    const configDir = path.dirname(path.resolve(configPath));
    return path.resolve(configDir, normalizedConfig.data_dir);
  }

  return getDefaultDataDir(homeDir);
}

/**
 * Normalize embedded absolute legacy path strings in config values when a
 * config file has moved from a legacy `toduai` path to the current `todu`
 * path. This covers values like `data_dir`, plugin module paths, and plugin
 * config strings that reference the old absolute root.
 */
export function normalizeConfigPaths(
  config: ToduFileConfig,
  configPath: string,
  options: ConfigResolutionOptions = {},
): ToduFileConfig {
  const replacement = resolveLegacyConfigReplacement(configPath, options.homeDir ?? os.homedir());
  if (replacement === null) {
    return config;
  }

  return rewriteLegacyPathStrings(
    config,
    replacement.legacyConfigDir,
    replacement.configDir,
  ) as ToduFileConfig;
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
  } else {
    const configEnv = resolvePreferredEnvValue(env, TODU_CONFIG_ENV, TODUAI_CONFIG_ENV);
    if (configEnv !== null) {
      configSource = configEnv.legacy
        ? `${configEnv.source} env var (legacy)`
        : `${configEnv.source} env var`;
    } else {
      configSource = "default";
    }
  }

  const resolvedConfig = normalizeConfigPaths(config ?? {}, configPath, options);
  const dataDir = resolveDataDir(configPath, resolvedConfig, options);

  let dataDirSource: string;
  const dataDirEnv = resolvePreferredEnvValue(env, TODU_DATA_DIR_ENV, TODUAI_DATA_DIR_ENV);
  if (dataDirEnv !== null) {
    dataDirSource = dataDirEnv.legacy
      ? `${dataDirEnv.source} env var (legacy)`
      : `${dataDirEnv.source} env var`;
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
 * Checks TODU_DATA_DIR first, then legacy TODUAI_DATA_DIR, then falls back to
 * the migrated/default data directory.
 */
export function resolveStoragePath(options: ConfigResolutionOptions = {}): string {
  const env = options.env ?? process.env;

  const dataDirEnv = resolvePreferredEnvValue(env, TODU_DATA_DIR_ENV, TODUAI_DATA_DIR_ENV);
  if (dataDirEnv !== null) {
    return path.resolve(dataDirEnv.value);
  }

  const migration = migrateLegacyDefaultConfigDirectory(options);
  return path.join(migration.configDir, "data");
}

function resolvePreferredEnvValue(
  env: NodeJS.ProcessEnv,
  currentName: string,
  legacyName: string,
): ResolvedEnvValue | null {
  const currentValue = env[currentName];
  if (currentValue !== undefined && currentValue.trim().length > 0) {
    return {
      value: currentValue,
      source: currentName,
      legacy: false,
    };
  }

  const legacyValue = env[legacyName];
  if (legacyValue !== undefined && legacyValue.trim().length > 0) {
    return {
      value: legacyValue,
      source: legacyName,
      legacy: true,
    };
  }

  return null;
}

function resolveLegacyConfigReplacement(
  configPath: string,
  homeDir: string,
): { configDir: string; legacyConfigDir: string } | null {
  const resolvedConfigPath = path.resolve(configPath);
  const configDir = path.dirname(resolvedConfigPath);
  const defaultConfigDir = getDefaultConfigDir(homeDir);

  if (configDir === defaultConfigDir) {
    return {
      configDir,
      legacyConfigDir: getLegacyDefaultConfigDir(homeDir),
    };
  }

  if (path.basename(configDir) === CURRENT_PROJECT_CONFIG_DIRNAME) {
    return {
      configDir,
      legacyConfigDir: path.join(path.dirname(configDir), LEGACY_PROJECT_CONFIG_DIRNAME),
    };
  }

  return null;
}

function rewriteLegacyPathStrings(
  value: unknown,
  legacyRoot: string,
  currentRoot: string,
): unknown {
  if (typeof value === "string") {
    return rewriteLegacyPathString(value, legacyRoot, currentRoot);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => rewriteLegacyPathStrings(entry, legacyRoot, currentRoot));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      rewriteLegacyPathStrings(entry, legacyRoot, currentRoot),
    ]),
  );
}

function rewriteLegacyPathString(value: string, legacyRoot: string, currentRoot: string): string {
  if (value === legacyRoot) {
    return currentRoot;
  }

  const legacyPrefix = `${legacyRoot}${path.sep}`;
  if (value.startsWith(legacyPrefix)) {
    return `${currentRoot}${value.slice(legacyRoot.length)}`;
  }

  return value;
}
