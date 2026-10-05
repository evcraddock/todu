import type { StorageAdapterInterface } from "@automerge/automerge-repo/slim";

// Automerge autosaves wait 100 ms after the preceding save finishes.
export const STORAGE_SAVE_QUIET_MS = 120;
export const STORAGE_CLOSE_TIMEOUT_MS = 5_000;

/** Track writes without changing adapter error propagation or persistence semantics. */
export function createStorageWriteDrain(storage: StorageAdapterInterface): {
  adapter: StorageAdapterInterface;
  drain(): Promise<void>;
} {
  const pending = new Set<Promise<void>>();
  let generation = 0;
  const failures: unknown[] = [];

  function track(operation: Promise<void>): Promise<void> {
    generation += 1;
    pending.add(operation);
    void operation.then(
      () => pending.delete(operation),
      (error: unknown) => {
        pending.delete(operation);
        failures.push(error);
      },
    );
    return operation;
  }

  return {
    adapter: {
      load: (key) => storage.load(key),
      loadRange: (key) => storage.loadRange(key),
      save: (key, data) => track(storage.save(key, data)),
      remove: (key) => track(storage.remove(key)),
      removeRange: (key) => track(storage.removeRange(key)),
    },
    async drain() {
      while (true) {
        await Promise.allSettled([...pending]);
        const before = generation;
        await new Promise((resolve) => setTimeout(resolve, STORAGE_SAVE_QUIET_MS));
        if (pending.size === 0 && generation === before) {
          if (failures.length > 0) {
            const details = failures
              .map((error) => (error instanceof Error ? error.message : String(error)))
              .join("; ");
            throw new AggregateError(
              failures,
              `Local storage writes failed during shutdown: ${details}`,
            );
          }
          return;
        }
      }
    },
  };
}

/** A timeout is a failure, not a claim that outstanding filesystem work was cancelled. */
export async function withStorageCloseTimeout(close: () => Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      close(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `Local storage shutdown timed out after ${STORAGE_CLOSE_TIMEOUT_MS} ms; pending writes may still be active`,
              ),
            ),
          STORAGE_CLOSE_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
