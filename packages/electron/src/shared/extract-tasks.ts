/**
 * Extract Task-like objects from an agent tool execution result.
 *
 * Tool results have the shape:
 * `{ content: [{ type: "text", text: jsonString }], details: {} }`
 *
 * The JSON text may contain a Task array from list_tasks or search_tasks.
 * Returns an empty array if the result can't be parsed or doesn't contain tasks.
 *
 * Shared between main process and renderer.
 */
export function extractTasksFromResult<T = unknown>(result: unknown): T[] {
  if (!result || typeof result !== "object") return [];

  const r = result as { content?: Array<{ type: string; text?: string }>; details?: unknown };
  if (!r.content || !Array.isArray(r.content)) return [];

  for (const block of r.content) {
    if (block.type !== "text" || !block.text) continue;
    try {
      const parsed = JSON.parse(block.text);
      if (Array.isArray(parsed)) {
        // Verify items look like tasks (must have id and title)
        return parsed.filter(
          (item: unknown) =>
            typeof item === "object" && item !== null && "id" in item && "title" in item,
        ) as T[];
      }
    } catch {
      // Not JSON, skip to next block
    }
  }

  return [];
}
