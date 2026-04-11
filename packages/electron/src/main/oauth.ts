import fs from "node:fs";
import path from "node:path";
import type { OAuthCredentials, OAuthProviderInterface } from "@mariozechner/pi-ai";
import { getOAuthProvider, getOAuthProviders } from "@mariozechner/pi-ai/oauth";
import type { BrowserWindow } from "electron";
import { app, ipcMain, safeStorage, shell } from "electron";

// ============================================================================
// Types
// ============================================================================

/** Per-provider OAuth status returned to the renderer. */
export interface OAuthStatus {
  id: string;
  name: string;
  connected: boolean;
  expired: boolean;
}

/** Shape of the stored credentials file (encrypted per-provider). */
interface StoredCredentials {
  [providerId: string]: string; // base64-encoded encrypted JSON
}

// ============================================================================
// Credential Storage
// ============================================================================

function getCredentialsPath(): string {
  return path.join(app.getPath("userData"), "oauth-credentials.json");
}

function loadStoredCredentials(): StoredCredentials {
  try {
    const filePath = getCredentialsPath();
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8")) as StoredCredentials;
    }
  } catch {
    // Corrupt file, start fresh
  }
  return {};
}

function saveStoredCredentials(stored: StoredCredentials): void {
  const filePath = getCredentialsPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(stored, null, 2), "utf-8");
}

function encryptCredentials(creds: OAuthCredentials): string {
  const json = JSON.stringify(creds);
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(json).toString("base64");
  }
  return Buffer.from(`plain:${json}`).toString("base64");
}

function decryptCredentials(encoded: string): OAuthCredentials | null {
  try {
    const buf = Buffer.from(encoded, "base64");
    let json: string;
    if (safeStorage.isEncryptionAvailable()) {
      json = safeStorage.decryptString(buf);
    } else {
      const text = buf.toString("utf-8");
      if (text.startsWith("plain:")) {
        json = text.slice(6);
      } else {
        return null;
      }
    }
    return JSON.parse(json) as OAuthCredentials;
  } catch {
    return null;
  }
}

/** Save OAuth credentials for a provider. */
export function saveOAuthCredentials(providerId: string, creds: OAuthCredentials): void {
  const stored = loadStoredCredentials();
  stored[providerId] = encryptCredentials(creds);
  saveStoredCredentials(stored);
}

/** Load OAuth credentials for a provider (returns null if not stored or corrupt). */
export function loadOAuthCredentials(providerId: string): OAuthCredentials | null {
  const stored = loadStoredCredentials();
  const encoded = stored[providerId];
  if (!encoded) return null;
  return decryptCredentials(encoded);
}

/** Remove OAuth credentials for a provider. */
export function removeOAuthCredentials(providerId: string): void {
  const stored = loadStoredCredentials();
  delete stored[providerId];
  saveStoredCredentials(stored);
}

// ============================================================================
// Token Refresh
// ============================================================================

/**
 * Get a valid API key from OAuth credentials for a specific OAuth provider.
 * Automatically refreshes expired tokens.
 * Returns null if no credentials are stored.
 */
async function getKeyFromOAuthProvider(provider: OAuthProviderInterface): Promise<string | null> {
  const creds = loadOAuthCredentials(provider.id);
  if (!creds) return null;

  // Check if expired
  if (Date.now() >= creds.expires) {
    try {
      const refreshed = await provider.refreshToken(creds);
      saveOAuthCredentials(provider.id, refreshed);
      return provider.getApiKey(refreshed);
    } catch {
      // Refresh failed — credentials are stale
      return null;
    }
  }

  return provider.getApiKey(creds);
}

/**
 * Model provider → OAuth provider mapping.
 *
 * Some model providers (e.g. "openai") have a corresponding OAuth provider
 * with a different ID (e.g. "openai-codex"). When the agent requests an API
 * key for a model provider, we also need to check related OAuth providers.
 */
export const OAUTH_PROVIDER_ALIASES: Record<string, string[]> = {
  openai: ["openai-codex"],
  google: ["google-gemini-cli", "google-antigravity"],
};

/**
 * Get a valid API key from OAuth credentials for a provider.
 * Checks the exact provider first, then falls back to related OAuth providers
 * (e.g. "openai" also checks "openai-codex" credentials).
 * Automatically refreshes expired tokens.
 * Returns null if no credentials are stored.
 */
export async function getOAuthApiKeyForProvider(providerId: string): Promise<string | null> {
  // Try exact match first
  const exactProvider = getOAuthProvider(providerId);
  if (exactProvider) {
    const key = await getKeyFromOAuthProvider(exactProvider);
    if (key) return key;
  }

  // Try aliases (e.g. "openai" → "openai-codex")
  const aliases = OAUTH_PROVIDER_ALIASES[providerId];
  if (aliases) {
    for (const alias of aliases) {
      const aliasProvider = getOAuthProvider(alias);
      if (aliasProvider) {
        const key = await getKeyFromOAuthProvider(aliasProvider);
        if (key) return key;
      }
    }
  }

  return null;
}

// ============================================================================
// Status
// ============================================================================

/** Get OAuth status for all providers that support OAuth. */
export function getOAuthStatus(): OAuthStatus[] {
  return getOAuthProviders().map((provider: OAuthProviderInterface) => {
    const creds = loadOAuthCredentials(provider.id);
    return {
      id: provider.id,
      name: provider.name,
      connected: creds !== null,
      expired: creds !== null && Date.now() >= creds.expires,
    };
  });
}

// ============================================================================
// Login Flow
// ============================================================================

/** Active login state — tracks pending prompt resolution and abort */
let pendingPromptResolve: ((value: string) => void) | null = null;
let pendingPromptReject: ((reason: Error) => void) | null = null;
let pendingAbortController: AbortController | null = null;

/**
 * Run the OAuth login flow for a provider.
 * Opens the browser for auth and forwards prompts to the renderer.
 */
async function runOAuthLogin(
  providerId: string,
  mainWindow: BrowserWindow,
): Promise<OAuthCredentials> {
  const provider = getOAuthProvider(providerId);
  if (!provider) {
    throw new Error(`Unknown OAuth provider: ${providerId}`);
  }

  pendingAbortController = new AbortController();

  const credentials = await provider.login({
    onAuth: (info) => {
      shell.openExternal(info.url);
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send("todu:oauth:event", {
          type: "auth-opened",
          providerId,
          url: info.url,
        });
      }
    },
    onPrompt: (prompt) => {
      return new Promise<string>((resolve, reject) => {
        pendingPromptResolve = resolve;
        pendingPromptReject = reject;
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send("todu:oauth:event", {
            type: "prompt",
            providerId,
            message: prompt.message,
            placeholder: prompt.placeholder,
          });
        }
      });
    },
    onProgress: (message) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send("todu:oauth:event", {
          type: "progress",
          providerId,
          message,
        });
      }
    },
    signal: pendingAbortController.signal,
  });

  pendingAbortController = null;
  return credentials;
}

// ============================================================================
// IPC Handlers
// ============================================================================

let registeredWindow: BrowserWindow | null = null;

export function registerOAuthIpc(mainWindow: BrowserWindow): void {
  registeredWindow = mainWindow;

  /** Start OAuth login for a provider. */
  ipcMain.handle("todu:oauth:login", async (_event, providerId: string) => {
    if (!registeredWindow || registeredWindow.isDestroyed()) {
      throw new Error("No window available for OAuth flow");
    }

    try {
      const credentials = await runOAuthLogin(providerId, registeredWindow);
      saveOAuthCredentials(providerId, credentials);

      if (!registeredWindow.isDestroyed()) {
        registeredWindow.webContents.send("todu:oauth:event", {
          type: "login-complete",
          providerId,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!registeredWindow.isDestroyed()) {
        registeredWindow.webContents.send("todu:oauth:event", {
          type: "login-error",
          providerId,
          message,
        });
      }
      throw new Error(message);
    }
  });

  /** Respond to an OAuth prompt (user pasting auth code). */
  ipcMain.handle("todu:oauth:prompt-response", (_event, code: string) => {
    if (pendingPromptResolve) {
      pendingPromptResolve(code);
      pendingPromptResolve = null;
      pendingPromptReject = null;
    }
  });

  /** Cancel an in-progress login. */
  ipcMain.handle("todu:oauth:cancel", () => {
    if (pendingAbortController) {
      pendingAbortController.abort();
      pendingAbortController = null;
    }
    if (pendingPromptReject) {
      pendingPromptReject(new Error("Login cancelled by user"));
      pendingPromptResolve = null;
      pendingPromptReject = null;
    }
  });

  /** Get OAuth status for all providers. */
  ipcMain.handle("todu:oauth:status", () => {
    return getOAuthStatus();
  });

  /** Disconnect (remove credentials) for a provider. */
  ipcMain.handle("todu:oauth:disconnect", (_event, providerId: string) => {
    removeOAuthCredentials(providerId);
  });
}

export function unregisterOAuthIpc(): void {
  registeredWindow = null;
  pendingPromptResolve = null;
  pendingPromptReject = null;
  if (pendingAbortController) {
    pendingAbortController.abort();
    pendingAbortController = null;
  }

  ipcMain.removeHandler("todu:oauth:login");
  ipcMain.removeHandler("todu:oauth:prompt-response");
  ipcMain.removeHandler("todu:oauth:cancel");
  ipcMain.removeHandler("todu:oauth:status");
  ipcMain.removeHandler("todu:oauth:disconnect");
}
