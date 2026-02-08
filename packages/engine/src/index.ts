import { DEFAULT_DATA_DIR } from "@todu/core";
import { createHabitNamespace, registerHabitProcessor } from "./habits.js";
import { createLabelNamespace } from "./labels.js";
import { createNoteNamespace } from "./notes.js";
import { createProjectNamespace } from "./projects.js";
import { createRecurringNamespace, registerRecurringProcessor } from "./recurring.js";
import { processTemplates } from "./scheduling.js";
import { initStorage } from "./storage.js";
import { createTaskNamespace } from "./tasks.js";
import { type Todu, type ToduConfig, createStubNamespaces } from "./todu.js";

export type { Todu, ToduConfig } from "./todu.js";
export type {
  HabitNamespace,
  LabelNamespace,
  NoteNamespace,
  ProjectNamespace,
  RecurringNamespace,
  TaskNamespace,
} from "./todu.js";
export type { Storage } from "./storage.js";
export type { UpcomingOccurrence } from "./recurring.js";

// Re-export schedule utilities for consumers
export {
  describeSchedule,
  isScheduledDate,
  nextOccurrence,
  nextOccurrences,
  todayInTimezone,
} from "./schedule.js";
export { registerProcessor, clearProcessors, getRegisteredProcessors } from "./scheduling.js";
export type { SchedulableItem, ProcessingContext, TemplateProcessor } from "./scheduling.js";

/**
 * Create a Todu SDK instance.
 *
 * Initializes Automerge storage, loads or creates the catalog document,
 * processes any due recurring templates/habits, and returns the SDK
 * with all operation namespaces.
 */
export async function createTodu(config?: Partial<ToduConfig>): Promise<Todu> {
  const resolvedConfig: ToduConfig = {
    storagePath: config?.storagePath ?? DEFAULT_DATA_DIR,
  };

  const storage = await initStorage(resolvedConfig.storagePath);

  // Register processors before processing
  registerRecurringProcessor(storage.catalog, storage.repo);
  registerHabitProcessor(storage.catalog, storage.repo);

  // Process due templates/habits before returning the SDK.
  // This is the "generate on access" pattern — every CLI invocation
  // and Electron launch triggers template processing.
  await processTemplates(storage.catalog);

  const stubs = createStubNamespaces(resolvedConfig);

  return {
    ...stubs,
    project: createProjectNamespace(storage.catalog),
    task: createTaskNamespace(storage.catalog, storage.repo),
    label: createLabelNamespace(storage.catalog, storage.repo),
    note: createNoteNamespace(storage.catalog, storage.repo),
    recurring: createRecurringNamespace(storage.catalog, storage.repo),
    habit: createHabitNamespace(storage.catalog, storage.repo),
    onChange(callback: () => void): () => void {
      storage.catalog.on("change", callback);
      return () => {
        storage.catalog.off("change", callback);
      };
    },
    async close() {
      await storage.close();
    },
  };
}
