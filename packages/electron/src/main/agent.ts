import type { AgentEvent } from "@earendil-works/pi-agent-core";
import { Agent } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import { createHabitId, createProjectId, createRecurringId, createTaskId } from "@todu/core";
import type { Todu } from "@todu/engine";
import type { BrowserWindow } from "electron";
import { ipcMain } from "electron";
import { models } from "./models.js";
import { loadOAuthCredentials, OAUTH_PROVIDER_ALIASES } from "./oauth.js";
import { loadSettings } from "./settings.js";
import { createToduTools } from "./tools.js";

// ============================================================================
// System Prompt
// ============================================================================

const TODU_SYSTEM_PROMPT = `You are a task management assistant for todu. You help plan, organize, and reason about work.

You have access to tools for managing tasks, projects, habits, recurring tasks, labels, and notes. Use them to:
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
- **Recurring tasks** generate tasks on a schedule (e.g., "Weekly review every Friday").
- **Notes** are freeform text, optionally attached to a task, project, or habit.

## Guidelines

- Be concise and direct
- When listing items, format them clearly
- When creating tasks, confirm what was created
- Suggest next actions when appropriate
- If asked about something outside your capabilities, say so clearly

## Tool Usage

- **Always use tool filter parameters** when the user specifies criteria. For example, if the user asks for "inprogress tasks", call list_tasks with status: "inprogress" — do NOT fetch all tasks and filter in your response.
- When the user asks for multiple statuses (e.g., "active or inprogress"), pass them as an array: status: ["active", "inprogress"].
- The UI updates based on the filter parameters you pass to tools. If you don't pass filters, the UI won't reflect the user's intent.`;

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
export function resolveModel(
  provider: string,
  modelId: string,
  deps: {
    aliases: Record<string, string[]>;
    hasOAuthCreds: (providerId: string) => boolean;
    getModelFn: (provider: string, modelId: string) => Model<Api> | undefined;
  } = {
    aliases: OAUTH_PROVIDER_ALIASES,
    hasOAuthCreds: (id) => loadOAuthCredentials(id) !== null,
    getModelFn: (provider, modelId) => models.getModel(provider, modelId),
  },
): Model<Api> | undefined {
  // A directly connected provider takes precedence over its legacy aliases.
  if (deps.hasOAuthCreds(provider)) {
    const directModel = deps.getModelFn(provider, modelId);
    if (directModel) return directModel;
  }

  // Check if an OAuth alias provider has credentials and the model
  const providerAliases = deps.aliases[provider];
  if (providerAliases) {
    for (const alias of providerAliases) {
      if (deps.hasOAuthCreds(alias)) {
        const aliasModel = deps.getModelFn(alias, modelId);
        if (aliasModel) return aliasModel;
      }
    }
  }

  // Fall through to direct lookup
  return deps.getModelFn(provider, modelId);
}

// ============================================================================
// Agent Setup
// ============================================================================

let agent: Agent | null = null;
let unsubscribe: (() => void) | null = null;

// ============================================================================
// Focused Entity Context
// ============================================================================

export type FocusedEntityType = "task" | "project" | "habit" | "recurring";

export interface FocusedEntity {
  entityType: FocusedEntityType;
  entityId: string;
}

let focusedEntity: FocusedEntity | null = null;
let previousFocusedEntity: FocusedEntity | null = null;
let focusGeneration = 0;

export function buildSystemPrompt(focused: FocusedEntity | null, entityData?: string): string {
  if (!focused || !entityData) return TODU_SYSTEM_PROMPT;

  return `${TODU_SYSTEM_PROMPT}

## Currently Focused ${focused.entityType.charAt(0).toUpperCase() + focused.entityType.slice(1)}

The user is currently viewing this ${focused.entityType}. When they say "this", "it", or refer to the current ${focused.entityType} without specifying an ID, use ID "${focused.entityId}".

${entityData}`;
}

async function loadEntityData(todu: Todu, entity: FocusedEntity): Promise<string | undefined> {
  switch (entity.entityType) {
    case "task": {
      const result = await todu.task.get(createTaskId(entity.entityId));
      if (!result.ok) return undefined;
      const t = result.value;
      return `\`\`\`json
${JSON.stringify({ id: t.id, title: t.title, status: t.status, priority: t.priority, description: t.description, labels: t.labels, dueDate: t.dueDate, projectId: t.projectId }, null, 2)}
\`\`\``;
    }
    case "project": {
      const result = await todu.project.get(createProjectId(entity.entityId));
      if (!result.ok) return undefined;
      const p = result.value;
      return `\`\`\`json
${JSON.stringify({ id: p.id, name: p.name, status: p.status, priority: p.priority, description: p.description }, null, 2)}
\`\`\``;
    }
    case "habit": {
      const result = await todu.habit.get(createHabitId(entity.entityId));
      if (!result.ok) return undefined;
      const h = result.value;
      return `\`\`\`json
${JSON.stringify({ id: h.id, title: h.title, paused: h.paused, schedule: h.schedule, projectId: h.projectId, description: h.description }, null, 2)}
\`\`\``;
    }
    case "recurring": {
      const result = await todu.recurring.get(createRecurringId(entity.entityId));
      if (!result.ok) return undefined;
      const r = result.value;
      return `\`\`\`json
${JSON.stringify({ id: r.id, title: r.title, paused: r.paused, schedule: r.schedule, priority: r.priority, projectId: r.projectId, description: r.description }, null, 2)}
\`\`\``;
    }
    default:
      return undefined;
  }
}

/** Settle the active response before Pi resets the conversation. */
export async function resetAgentConversation(target: Agent): Promise<void> {
  target.abort();
  await target.waitForIdle();
  target.reset();
}

/** Replace focused instructions while preserving the executable tool declarations. */
export function setAgentSystemPrompt(target: Agent, prompt: string): void {
  target.state.messages = [
    {
      role: "system",
      content: prompt,
      toolsAdded: target.state.tools.map(({ name, description, parameters }) => ({
        name,
        description,
        parameters,
      })),
      timestamp: Date.now(),
    },
    ...target.state.messages.filter((message) => message.role !== "system"),
  ];
}

async function updateAgentContext(todu: Todu): Promise<void> {
  if (!agent) return;
  const gen = ++focusGeneration;
  if (!focusedEntity) {
    setAgentSystemPrompt(agent, TODU_SYSTEM_PROMPT);
    return;
  }
  const entityData = await loadEntityData(todu, focusedEntity);
  if (!agent || gen !== focusGeneration) return; // stale, skip
  setAgentSystemPrompt(agent, buildSystemPrompt(focusedEntity, entityData));
}

/**
 * Initialize the agent with todu tools and wire up IPC handlers.
 * Call this once during app startup after the engine and window are ready.
 */
export function setupAgent(todu: Todu, mainWindow: BrowserWindow): void {
  const tools = createToduTools(todu, mainWindow);
  const settings = loadSettings();
  const model = resolveModel(settings.provider, settings.modelId);

  agent = new Agent({
    initialState: {
      systemPrompt: TODU_SYSTEM_PROMPT,
      model,
      tools,
    },
    streamFn: (model, context, options) => models.streamSimple(model, context, options),
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
    if (!models.getModel(agent.state.model.provider, agent.state.model.id)) {
      throw new Error("The selected model is unavailable. Choose an available model in Settings.");
    }
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

  ipcMain.handle("todu:agent:clear", async () => {
    if (!agent) return;
    await resetAgentConversation(agent);
  });

  ipcMain.handle("todu:agent:set-model", (_event, provider: string, modelId: string) => {
    if (!agent) return;
    const newModel = resolveModel(provider, modelId);
    if (!newModel)
      throw new Error(
        `Model ${provider}/${modelId} is unavailable. Choose an available model in Settings.`,
      );
    agent.state.model = newModel;
  });

  ipcMain.handle(
    "todu:agent:focus-entity",
    async (_event, entityType: string, entityId: string) => {
      const validTypes: FocusedEntityType[] = ["task", "project", "habit", "recurring"];
      if (!validTypes.includes(entityType as FocusedEntityType)) return;

      // Clear conversation when switching between different entities.
      // previousFocusedEntity persists across list views so that
      // Task A → list → Task B still clears.
      if (
        agent &&
        previousFocusedEntity &&
        (previousFocusedEntity.entityType !== entityType ||
          previousFocusedEntity.entityId !== entityId)
      ) {
        const currentAgent = agent;
        await resetAgentConversation(currentAgent);
        if (agent !== currentAgent) return;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("todu:agent:event", { type: "messages_cleared" });
        }
      }

      focusedEntity = { entityType: entityType as FocusedEntityType, entityId };
      previousFocusedEntity = focusedEntity;
      await updateAgentContext(todu);
    },
  );

  ipcMain.handle("todu:agent:clear-focused-entity", async () => {
    focusedEntity = null;
    await updateAgentContext(todu);
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
  ipcMain.removeHandler("todu:agent:focus-entity");
  ipcMain.removeHandler("todu:agent:clear-focused-entity");

  focusedEntity = null;
  previousFocusedEntity = null;
  focusGeneration = 0;
  agent = null;
}
