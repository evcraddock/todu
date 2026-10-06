import fs from "node:fs";
import path from "node:path";
import { normalizeConfigPaths, type SyncListenerConfig, type ToduFileConfig } from "@todu/core";
import { isMap, parse, parseDocument, stringify } from "yaml";

// ============================================================================
// CLI Configuration
//
// Config file parsing (YAML) and saving live here.
// Path resolution is delegated to @todu/core for consistency across clients.
// ============================================================================

// Re-export from core so existing CLI consumers don't break
export type { ToduFileConfig as ToduConfig } from "@todu/core";
export {
  resolveConfigPath as getConfigPath,
  resolveConfigSources,
  resolveDataDir,
} from "@todu/core";

/**
 * Load config from YAML file. Returns empty config if file doesn't exist.
 * Throws on malformed YAML so users know their config is broken.
 */
export function loadConfig(configPath: string): ToduFileConfig {
  let content: string;
  try {
    content = fs.readFileSync(configPath, "utf-8");
  } catch {
    return {}; // File not found — that's fine
  }
  // Let YAML parse errors surface
  const parsed = (parse(content) as ToduFileConfig) ?? {};
  return normalizeConfigPaths(parsed, configPath);
}

/** Patch only listener settings, retaining other values, relative paths, and YAML comments. */
export function saveSyncListenerConfig(config: SyncListenerConfig, configPath: string): void {
  let content = "";
  try {
    content = fs.readFileSync(configPath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const document = parseDocument(content);
  if (document.errors.length > 0) throw document.errors[0];
  if (document.contents !== null && !isMap(document.contents)) {
    throw new Error(`Cannot update listener settings: ${configPath} must contain a YAML mapping`);
  }
  for (const [key, value] of Object.entries(config)) {
    if (value !== undefined) document.setIn(["sync", "listener", key], value);
  }
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, document.toString(), "utf-8");
}

/** Save config to YAML file, creating its directory if needed. */
export function saveConfig(config: ToduFileConfig, configPath: string): void {
  const dir = path.dirname(configPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath, stringify(config), "utf-8");
}
