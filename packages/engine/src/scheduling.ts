import type { DocHandle } from "@automerge/automerge-repo";
import type { CatalogDocument } from "@todu/core";

// ============================================================================
// Template processing framework
// ============================================================================

/**
 * A schedulable item from the catalog — either a recurring template or a habit.
 * Both share these fields that the framework needs to check.
 */
export interface SchedulableItem {
  id: string;
  nextDue: string; // YYYY-MM-DD
  timezone: string;
  paused: boolean;
  endDate?: string;
}

/**
 * Context passed to template processors during processTemplates().
 * Processors determine "today" per-item using todayInTimezone()
 * with each item's configured timezone.
 */
export interface ProcessingContext {
  /** The catalog document handle for reading/writing */
  catalog: DocHandle<CatalogDocument>;
}

/**
 * A handler that processes due items of a specific type.
 * Registered by recurring templates and habits modules.
 *
 * @param context - Processing context with catalog access
 * @returns Number of items processed
 */
export type TemplateProcessor = (context: ProcessingContext) => Promise<number>;

/**
 * Registry of template processors.
 * Each processor handles a specific type of schedulable item.
 */
const processors: Map<string, TemplateProcessor> = new Map();

/**
 * Register a template processor.
 * Called by recurring.ts and habits.ts to register their processing logic.
 *
 * @param type - Processor type identifier (e.g., "recurring", "habit")
 * @param processor - The processing function
 */
export function registerProcessor(type: string, processor: TemplateProcessor): void {
  processors.set(type, processor);
}

/**
 * Clear all registered processors.
 * Used in tests to reset state between runs.
 */
export function clearProcessors(): void {
  processors.clear();
}

/**
 * Get all registered processor types.
 * Used in tests to verify registration.
 */
export function getRegisteredProcessors(): string[] {
  return Array.from(processors.keys());
}

/**
 * Process registered template processors.
 *
 * Processors run in registration order. Callers may exclude processor types
 * (for example, skipping recurring during client startup).
 */
export async function processTemplates(
  catalog: DocHandle<CatalogDocument>,
  options: {
    excludeTypes?: string[];
  } = {},
): Promise<void> {
  if (processors.size === 0) return;

  const excluded = new Set(
    (options.excludeTypes ?? []).map((type) => type.trim()).filter((type) => type.length > 0),
  );

  for (const [type, processor] of processors) {
    if (excluded.has(type)) {
      continue;
    }

    try {
      const context: ProcessingContext = {
        catalog,
      };
      await processor(context);
    } catch (e) {
      // Log but don't fail — one processor failing shouldn't block others
      console.error(
        `[scheduling] processor "${type}" failed:`,
        e instanceof Error ? e.message : String(e),
      );
    }
  }
}
