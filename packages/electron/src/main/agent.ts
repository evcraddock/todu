import { Agent } from "@mariozechner/pi-agent-core";
import type { AgentEvent } from "@mariozechner/pi-agent-core";
import type { Api, Model } from "@mariozechner/pi-ai";
import { getModel } from "@mariozechner/pi-ai";
import type { Todu } from "@todu/engine";
import type { BrowserWindow } from "electron";
import { ipcMain } from "electron";
import {
  OAUTH_PROVIDER_ALIASES,
  getOAuthApiKeyForProvider,
  loadOAuthCredentials,
} from "./oauth.js";
import { getApiKey, loadSettings } from "./settings.js";
import { createToduTools } from "./tools.js";

// ============================================================================
// System Prompt
// ============================================================================

const TODU_SYSTEM_PROMPT = `You are a task management assistant for todu. You help plan, organize, and reason about work.

You have access to tools for managing tasks, projects, habits, recurring templates, labels, and notes. Use them to:
- Answer questions about current work status
- Create and organize tasks
- Break features into subtasks
- Track habit consistency
- Suggest priorities and next actions
- Add notes and comments

You do NOT have access to the file system, code, or terminal. For coding work, the user works with a separate coding agent in the terminal.

## Data Model

- **Projects** contain tasks. Each project has a status (active/done/canceled) and priority.
- **Tasks** have a title, status (active/inprogress/waiting/done/canceled), priority (low/medium/high), optional due date, scheduled date, labels, and description.
- **Labels** are tags that can be applied to tasks.
- **Habits** are recurring check-in items with streaks (e.g., "Exercise daily").
- **Recurring templates** generate tasks on a schedule (e.g., "Weekly review every Friday").
- **Notes** are freeform text, optionally attached to a task, project, or habit.

## Guidelines

- Be concise and direct
- When listing items, format them clearly
- When creating tasks, confirm what was created
- Suggest next actions when appropriate
- If asked about something outside your capabilities, say so clearly`;

// ============================================================================
// Model Resolution
// ============================================================================

/**
 * Resolve a model, preferring an OAuth-connected alias provider when available.
 *
 * Example: if provider is "openai" and modelId is "gpt-5.1", but the user has
 * OAuth credentials for "openai-codex" and the model also exists there, return
 * the "openai-codex" variant (which uses the correct chatgpt.com base URL).
 */
function resolveModel(provider: string, modelId: string): Model<Api> | undefined {
  // Check if an OAuth alias provider has credentials and the model
  const aliases = OAUTH_PROVIDER_ALIASES[provider];
  if (aliases) {
    for (const alias of aliases) {
      if (loadOAuthCredentials(alias)) {
        const aliasModel = getModel(alias, modelId);
        if (aliasModel) return aliasModel;
      }
    }
  }

  // Also check the reverse: if provider is "openai-codex" but no OAuth creds,
  // fall back to the base provider model
  return getModel(provider, modelId);
}

// ============================================================================
// Agent Setup
// ============================================================================

let agent: Agent | null = null;
let unsubscribe: (() => void) | null = null;

/**
 * Initialize the agent with todu tools and wire up IPC handlers.
 * Call this once during app startup after the engine and window are ready.
 */
export function setupAgent(todu: Todu, mainWindow: BrowserWindow): void {
  const tools = createToduTools(todu);
  const settings = loadSettings();
  const model = resolveModel(settings.provider, settings.modelId);

  agent = new Agent({
    initialState: {
      systemPrompt: TODU_SYSTEM_PROMPT,
      model,
      tools,
    },
    getApiKey: async (provider: string) => {
      // OAuth credentials take priority over manual API keys
      const oauthKey = await getOAuthApiKeyForProvider(provider);
      if (oauthKey) return oauthKey;
      return getApiKey(provider);
    },
  });

  // Forward agent events to renderer
  unsubscribe = agent.subscribe((event: AgentEvent) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send("todu:agent:event", event);
    }
  });

  // ── IPC Handlers ─────────────────────────────────────────────────
  ipcMain.handle("todu:agent:send", async (_event, message: string) => {
    if (!agent) throw new Error("Agent not initialized");
    try {
      await agent.prompt(message);
    } catch (err) {
      // Agent errors are emitted as events, but re-throw for invoke error handling
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(msg);
    }
  });

  ipcMain.handle("todu:agent:abort", () => {
    if (!agent) return;
    agent.abort();
  });

  ipcMain.handle("todu:agent:clear", () => {
    if (!agent) return;
    agent.clearMessages();
  });

  ipcMain.handle("todu:agent:set-model", (_event, provider: string, modelId: string) => {
    if (!agent) return;
    const newModel = resolveModel(provider, modelId);
    if (newModel) {
      agent.setModel(newModel);
    }
  });
}

/**
 * Clean up the agent and remove IPC handlers.
 * Call this during app shutdown.
 */
export function teardownAgent(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }

  ipcMain.removeHandler("todu:agent:send");
  ipcMain.removeHandler("todu:agent:abort");
  ipcMain.removeHandler("todu:agent:clear");
  ipcMain.removeHandler("todu:agent:set-model");

  agent = null;
}
