import type { AuthPrompt } from "@earendil-works/pi-ai";
import type { BrowserWindow } from "electron";
import { app, ipcMain, shell } from "electron";
import { loadOAuthCredentials } from "./credentials.js";
import { getInstallationId } from "./installation-id.js";
import { models } from "./models.js";

export {
  loadOAuthCredentials,
  removeOAuthCredentials,
  saveOAuthCredentials,
} from "./credentials.js";

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

/**
 * Model provider → OAuth provider mapping.
 *
 * Some model providers (e.g. "openai") have a corresponding OAuth provider
 * with a different ID (e.g. "openai-codex"). When the agent requests an API
 * key for a model provider, we also need to check related OAuth providers.
 */
export const OAUTH_PROVIDER_ALIASES: Record<string, string[]> = {
  openai: ["openai-codex"],
};

// ============================================================================
// Status
// ============================================================================

/** Get OAuth status for all providers that support OAuth. */
export function getOAuthStatus(): OAuthStatus[] {
  return models
    .getProviders()
    .filter((provider) => provider.auth.oauth?.isSubscription)
    .map((provider) => {
      const creds = loadOAuthCredentials(provider.id);
      return {
        id: provider.id,
        name: provider.auth.oauth!.name,
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
async function runOAuthLogin(providerId: string, mainWindow: BrowserWindow): Promise<void> {
  if (!models.getProvider(providerId)?.auth.oauth?.isSubscription) {
    throw new Error(`Unknown OAuth provider: ${providerId}`);
  }
  if (pendingAbortController) throw new Error("An OAuth login is already in progress");

  const controller = new AbortController();
  pendingAbortController = controller;
  const send = (event: Record<string, unknown>): void => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send("todu:oauth:event", { ...event, providerId });
    }
  };
  try {
    await models.login(
      providerId,
      "oauth",
      {
        signal: controller.signal,
        prompt: (prompt: AuthPrompt) =>
          new Promise<string>((resolve, reject) => {
            const signal = prompt.signal ?? controller.signal;
            const cleanup = (): void => {
              signal.removeEventListener("abort", cancel);
              pendingPromptResolve = null;
              pendingPromptReject = null;
            };
            const cancel = (): void => {
              cleanup();
              reject(new Error("Login cancelled"));
            };
            pendingPromptResolve = (value) => {
              cleanup();
              resolve(value);
            };
            pendingPromptReject = (reason) => {
              cleanup();
              reject(reason);
            };
            signal.addEventListener("abort", cancel, { once: true });
            if (signal.aborted) {
              cancel();
              return;
            }
            const choices =
              prompt.type === "select"
                ? `\n${prompt.options.map((option) => `${option.id}: ${option.label}`).join("\n")}`
                : "";
            send({
              type: "prompt",
              inputType: prompt.type === "secret" ? "password" : "text",
              message: prompt.message + choices,
              placeholder: "placeholder" in prompt ? prompt.placeholder : undefined,
            });
          }),
        notify: (event) => {
          if (event.type === "auth_url") {
            void shell.openExternal(event.url);
            send({ type: "auth-opened", url: event.url });
          } else if (event.type === "device_code") {
            void shell.openExternal(event.verificationUri);
            send({
              type: "progress",
              message: `Enter code ${event.userCode} at ${event.verificationUri}`,
            });
          } else {
            send({ type: "progress", message: event.message });
          }
        },
      },
      {
        getDeviceId: () => getInstallationId(app.getPath("userData")),
        agentName: "Todu",
      },
    );
  } finally {
    pendingPromptReject?.(new Error("Login finished"));
    pendingAbortController = null;
  }
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

    const mainWindow = registeredWindow;
    try {
      await runOAuthLogin(providerId, mainWindow);

      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send("todu:oauth:event", {
          type: "login-complete",
          providerId,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send("todu:oauth:event", {
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
  ipcMain.handle("todu:oauth:disconnect", async (_event, providerId: string) => {
    await models.logout(providerId);
  });
}

export function unregisterOAuthIpc(): void {
  registeredWindow = null;
  pendingPromptReject?.(new Error("Login cancelled"));
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
