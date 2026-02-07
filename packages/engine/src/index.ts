import { DEFAULT_DATA_DIR } from "@todu/core";
import { createLabelNamespace } from "./labels.js";
import { createNoteNamespace } from "./notes.js";
import { createProjectNamespace } from "./projects.js";
import { initStorage } from "./storage.js";
import { createTaskNamespace } from "./tasks.js";
import { type Todu, type ToduConfig, createStubNamespaces } from "./todu.js";

export type { Todu, ToduConfig } from "./todu.js";
export type { LabelNamespace, NoteNamespace, ProjectNamespace, TaskNamespace } from "./todu.js";
export type { Storage } from "./storage.js";

/**
 * Create a Todu SDK instance.
 *
 * Initializes Automerge storage, loads or creates the catalog document,
 * and returns the SDK with all operation namespaces.
 */
export async function createTodu(config?: Partial<ToduConfig>): Promise<Todu> {
  const resolvedConfig: ToduConfig = {
    storagePath: config?.storagePath ?? DEFAULT_DATA_DIR,
  };

  const storage = await initStorage(resolvedConfig.storagePath);
  const stubs = createStubNamespaces(resolvedConfig);

  return {
    ...stubs,
    project: createProjectNamespace(storage.catalog),
    task: createTaskNamespace(storage.catalog, storage.repo),
    label: createLabelNamespace(storage.catalog, storage.repo),
    note: createNoteNamespace(storage.catalog, storage.repo),
    async close() {
      await storage.close();
    },
  };
}
