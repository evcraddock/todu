import { DEFAULT_DATA_DIR } from "@todu/core";
import { initStorage } from "./storage.js";
import { type Todu, type ToduConfig, createStubNamespaces } from "./todu.js";

export type { Todu, ToduConfig } from "./todu.js";
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
  const namespaces = createStubNamespaces(resolvedConfig);

  return {
    ...namespaces,
    async close() {
      await storage.close();
    },
  };
}
