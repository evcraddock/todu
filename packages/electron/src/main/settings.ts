import fs from "node:fs";
import path from "node:path";
import { app, ipcMain, safeStorage } from "electron";

// ============================================================================
// Types
// ============================================================================

/** Providers we expose in the settings UI. */
export const SUPPORTED_PROVIDERS = ["anthropic", "openai", "google"] as const;
export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

/** Persisted settings (JSON on disk). API keys stored separately via safeStorage. */
export interface AgentSettings {
  provider: SupportedProvider;
  modelId: string;
}

const DEFAULT_SETTINGS: AgentSettings = {
  provider: "anthropic",
  modelId: "claude-sonnet-4-20250514",
};

// ============================================================================
// File Paths
// ============================================================================

function getSettingsPath(): string {
  return path.join(app.getPath("userData"), "agent-settings.json");
}

function getKeysPath(): string {
  return path.join(app.getPath("userData"), "agent-keys.json");
}

// ============================================================================
// Settings (provider + model)
// ============================================================================

export function loadSettings(): AgentSettings {
  try {
    const filePath = getSettingsPath();
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Partial<AgentSettings>;
      return {
        provider: isValidProvider(data.provider) ? data.provider : DEFAULT_SETTINGS.provider,
        modelId: data.modelId || DEFAULT_SETTINGS.modelId,
      };
    }
  } catch {
    // Corrupt file, use defaults
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings: AgentSettings): void {
  const filePath = getSettingsPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), "utf-8");
}

function isValidProvider(v: unknown): v is SupportedProvider {
  return typeof v === "string" && (SUPPORTED_PROVIDERS as readonly string[]).includes(v);
}

// ============================================================================
// API Keys (encrypted via safeStorage)
// ============================================================================

interface EncryptedKeys {
  [provider: string]: string; // base64-encoded encrypted value
}

function loadEncryptedKeys(): EncryptedKeys {
  try {
    const filePath = getKeysPath();
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8")) as EncryptedKeys;
    }
  } catch {
    // Corrupt file, start fresh
  }
  return {};
}

function saveEncryptedKeys(keys: EncryptedKeys): void {
  const filePath = getKeysPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(keys, null, 2), "utf-8");
}

/**
 * Store an API key securely using Electron's safeStorage.
 * Falls back to plain text if safeStorage is unavailable (e.g., Linux without a keyring).
 */
export function setApiKey(provider: string, key: string): void {
  const keys = loadEncryptedKeys();
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(key);
    keys[provider] = encrypted.toString("base64");
  } else {
    // Fallback: base64-encode (not secure, but functional)
    keys[provider] = Buffer.from(`plain:${key}`).toString("base64");
  }
  saveEncryptedKeys(keys);
}

/**
 * Retrieve a stored API key.
 */
export function getApiKey(provider: string): string | undefined {
  const keys = loadEncryptedKeys();
  const stored = keys[provider];
  if (!stored) return undefined;

  try {
    const buf = Buffer.from(stored, "base64");
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(buf);
    }
    // Fallback: check for plain prefix
    const text = buf.toString("utf-8");
    if (text.startsWith("plain:")) {
      return text.slice(6);
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Check which providers have API keys stored (without revealing the keys).
 */
export function getStoredProviders(): Record<string, boolean> {
  const keys = loadEncryptedKeys();
  const result: Record<string, boolean> = {};
  for (const p of SUPPORTED_PROVIDERS) {
    result[p] = !!keys[p];
  }
  return result;
}

/**
 * Remove a stored API key.
 */
export function removeApiKey(provider: string): void {
  const keys = loadEncryptedKeys();
  delete keys[provider];
  saveEncryptedKeys(keys);
}

// ============================================================================
// IPC Handlers
// ============================================================================

export function registerSettingsIpc(): void {
  ipcMain.handle("todu:settings:get", () => {
    return loadSettings();
  });

  ipcMain.handle("todu:settings:save", (_event, settings: AgentSettings) => {
    saveSettings(settings);
  });

  ipcMain.handle("todu:settings:set-api-key", (_event, provider: string, key: string) => {
    setApiKey(provider, key);
  });

  ipcMain.handle("todu:settings:remove-api-key", (_event, provider: string) => {
    removeApiKey(provider);
  });

  ipcMain.handle("todu:settings:stored-providers", () => {
    return getStoredProviders();
  });
}

export function unregisterSettingsIpc(): void {
  ipcMain.removeHandler("todu:settings:get");
  ipcMain.removeHandler("todu:settings:save");
  ipcMain.removeHandler("todu:settings:set-api-key");
  ipcMain.removeHandler("todu:settings:remove-api-key");
  ipcMain.removeHandler("todu:settings:stored-providers");
}
