import fs from "node:fs";
import path from "node:path";
import { app, ipcMain } from "electron";
import { getStoredProviders, removeApiKey, setApiKey } from "./credentials.js";
import { models } from "./models.js";
import { OAUTH_PROVIDER_ALIASES } from "./oauth.js";

export { getApiKey, getStoredProviders, removeApiKey, setApiKey } from "./credentials.js";

// ============================================================================
// Types
// ============================================================================

/** Persisted settings (JSON on disk). API keys stored separately via safeStorage. */
export interface AgentSettings {
  provider: string;
  modelId: string;
  timezone: string;
}

/** Shape returned by the providers IPC endpoint. */
export interface ProviderInfo {
  id: string;
  label: string;
  models: { id: string; label: string }[];
  supportsApiKey: boolean;
  oauthAliases?: string[];
}

const DEFAULT_SETTINGS: AgentSettings = {
  provider: "anthropic",
  modelId: "claude-sonnet-4-6",
  timezone: resolveSystemTimezone(),
};

// ============================================================================
// File Paths
// ============================================================================

function getSettingsPath(): string {
  return path.join(app.getPath("userData"), "agent-settings.json");
}

// ============================================================================
// Settings (provider + model)
// ============================================================================

export function loadSettings(): AgentSettings {
  try {
    const filePath = getSettingsPath();
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Partial<AgentSettings>;
      const modelId =
        data.provider === "anthropic" && data.modelId === "claude-sonnet-4-20250514"
          ? DEFAULT_SETTINGS.modelId
          : data.modelId || DEFAULT_SETTINGS.modelId;
      return {
        provider: isValidProvider(data.provider) ? data.provider : DEFAULT_SETTINGS.provider,
        modelId,
        timezone: isValidTimezone(data.timezone) ? data.timezone : DEFAULT_SETTINGS.timezone,
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

function isValidProvider(v: unknown): v is string {
  return typeof v === "string" && models.getProvider(v) !== undefined;
}

function resolveSystemTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function isValidTimezone(value: unknown): value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return false;
  }

  try {
    new Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * Query the pi-ai model registry for all available providers and their models.
 */
export function listProviders(): ProviderInfo[] {
  return models.getProviders().map((provider) => ({
    id: provider.id,
    label: formatProviderLabel(provider.id),
    supportsApiKey: provider.auth.apiKey !== undefined,
    oauthAliases: OAUTH_PROVIDER_ALIASES[provider.id] ?? [],
    models: models.getModels(provider.id).map((m) => ({ id: m.id, label: m.name ?? m.id })),
  }));
}

/** Known brand casings for provider ID segments. */
const BRAND_CASING: Record<string, string> = {
  openai: "OpenAI",
  github: "GitHub",
  ai: "AI",
  xai: "xAI",
  cn: "CN",
};

/** Turn provider IDs like "openai-codex" into "OpenAI Codex". */
export function formatProviderLabel(id: string): string {
  return id
    .split("-")
    .map((w) => BRAND_CASING[w] ?? w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
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

  ipcMain.handle("todu:settings:providers", () => {
    return listProviders();
  });

  ipcMain.handle("todu:settings:version", () => {
    return app.getVersion();
  });
}

export function unregisterSettingsIpc(): void {
  ipcMain.removeHandler("todu:settings:get");
  ipcMain.removeHandler("todu:settings:save");
  ipcMain.removeHandler("todu:settings:set-api-key");
  ipcMain.removeHandler("todu:settings:remove-api-key");
  ipcMain.removeHandler("todu:settings:stored-providers");
  ipcMain.removeHandler("todu:settings:providers");
  ipcMain.removeHandler("todu:settings:version");
}
