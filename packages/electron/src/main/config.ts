import fs from "node:fs";
import type { ToduFileConfig } from "@todu/core";
import {
  normalizeConfigPaths,
  type RemoteSyncConfig,
  resolveConfigPath,
  resolveDataDir,
  resolveRemoteSyncConfig,
} from "@todu/core";
import { parse } from "yaml";

// ============================================================================
// Electron config loading
//
// Electron previously used resolveStoragePath() which only checks env vars
// and skips config.yaml entirely. This module reads the full config file
// so Electron can pick up sync.remote settings alongside data_dir.
// ============================================================================

export interface ElectronConfig {
  storagePath: string;
  remoteSync: RemoteSyncConfig | null;
}

/**
 * Load and resolve configuration for the Electron main process.
 *
 * Reads config.yaml (same path as CLI), resolves data directory,
 * and resolves remote sync config with env var overrides.
 */
export function loadElectronConfig(): ElectronConfig {
  const configPath = resolveConfigPath();

  let fileConfig: ToduFileConfig = {};
  try {
    const content = fs.readFileSync(configPath, "utf-8");
    fileConfig = normalizeConfigPaths((parse(content) as ToduFileConfig) ?? {}, configPath);
  } catch {
    // Config file not found or unreadable — use defaults
  }

  const storagePath = resolveDataDir(configPath, fileConfig);
  const remoteSync = resolveRemoteSyncConfig(fileConfig);

  return { storagePath, remoteSync };
}
