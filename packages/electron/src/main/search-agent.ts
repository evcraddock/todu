import { Agent } from "@mariozechner/pi-agent-core";
import type { AgentEvent, AgentTool } from "@mariozechner/pi-agent-core";
import type { TSchema } from "@sinclair/typebox";
import type { Task } from "@todu/core";
import type { Todu } from "@todu/engine";
import type { BrowserWindow } from "electron";
import { ipcMain } from "electron";
import { resolveModel } from "./agent.js";
import { getOAuthApiKeyForProvider } from "./oauth.js";
import { getApiKey, loadSettings } from "./settings.js";
import { createToduTools } from "./tools.js";

// ============================================================================
// Search-scoped agent
//
// A separate Agent instance optimized for interpreting natural-language
// search queries. It has only task-related tools and a focused prompt.
// Each search clears conversation history for a fresh one-shot call.
// ============================================================================

const SEARCH_SYSTEM_PROMPT = `You are a task search interpreter. Your ONLY job is to translate natural-language queries into tool calls that find matching tasks.

Given a user query, call the list_tasks or search_tasks tool with appropriate filters. You may call both if needed.

## Rules
- ALWAYS call at least one tool. Never respond with just text.
- Use list_tasks when the query maps to structured filters (status, priority, project, label, date ranges, overdue, today).
- Use search_tasks when the query is better served by keyword matching on titles.
- If the query combines both (e.g., "overdue bugs in todu"), use list_tasks with the structured parts.
- For project names, use the list_projects tool first to find the project ID, then filter by it.
- Do NOT provide commentary or explanations — just call the tools.`;

/** Tool names the search agent is allowed to use. */
const SEARCH_TOOL_NAMES = new Set(["list_tasks", "search_tasks", "list_projects", "list_labels"]);

let searchAgent: Agent | null = null;

/**
 * Initialize the search agent and register its IPC handler.
 * Call once during app startup after engine and window are ready.
 */
export function setupSearchAgent(todu: Todu, _mainWindow: BrowserWindow): void {
  const allTools = createToduTools(todu);
  const searchTools = allTools.filter((t) => SEARCH_TOOL_NAMES.has(t.name)) as AgentTool<TSchema>[];

  const settings = loadSettings();
  const model = resolveModel(settings.provider, settings.modelId);

  searchAgent = new Agent({
    initialState: {
      systemPrompt: SEARCH_SYSTEM_PROMPT,
      model,
      tools: searchTools,
    },
    getApiKey: async (provider: string) => {
      const oauthKey = await getOAuthApiKeyForProvider(provider);
      if (oauthKey) return oauthKey;
      return getApiKey(provider);
    },
  });

  // ── IPC Handler ────────────────────────────────────────────────────
  ipcMain.handle("todu:agent:search-tasks", async (_event, query: string): Promise<Task[]> => {
    if (!searchAgent) throw new Error("Search agent not initialized");

    // Fresh conversation for each search
    searchAgent.clearMessages();

    // Update model in case settings changed
    const currentSettings = loadSettings();
    const currentModel = resolveModel(currentSettings.provider, currentSettings.modelId);
    if (currentModel) searchAgent.setModel(currentModel);

    // Collect task results from tool executions
    const collectedTasks: Task[] = [];

    const unsub = searchAgent.subscribe((event: AgentEvent) => {
      if (event.type === "tool_execution_end" && !event.isError) {
        const tasks = extractTasksFromResult(event.result);
        collectedTasks.push(...tasks);
      }
    });

    try {
      await searchAgent.prompt(query);
    } finally {
      unsub();
    }

    // Deduplicate by task ID
    const seen = new Set<string>();
    return collectedTasks.filter((t) => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
  });
}

/**
 * Clean up the search agent and remove IPC handlers.
 */
export function teardownSearchAgent(): void {
  ipcMain.removeHandler("todu:agent:search-tasks");
  searchAgent = null;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extract Task[] from a tool execution result.
 * The tool returns { content: [{ type: "text", text: jsonString }], details: {} }.
 */
function extractTasksFromResult(result: unknown): Task[] {
  if (!result || typeof result !== "object") return [];

  const r = result as { content?: Array<{ type: string; text?: string }>; details?: unknown };
  if (!r.content || !Array.isArray(r.content)) return [];

  for (const block of r.content) {
    if (block.type !== "text" || !block.text) continue;
    try {
      const parsed = JSON.parse(block.text);
      if (Array.isArray(parsed)) {
        // Verify it looks like tasks (has id and title)
        return parsed.filter(
          (item: unknown) =>
            typeof item === "object" && item !== null && "id" in item && "title" in item,
        ) as Task[];
      }
    } catch {
      // Not JSON, skip
    }
  }

  return [];
}
