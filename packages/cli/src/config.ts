import fs from "node:fs";
import path from "node:path";
import { normalizeConfigPaths, type ToduFileConfig } from "@todu/core";
import { parse, stringify } from "yaml";

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

/**
 * Save config to YAML file. Creates directory if needed.
 */
export function saveConfig(config: ToduFileConfig, configPath: string): void {
  const dir = path.dirname(configPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath, stringify(config), "utf-8");
}
