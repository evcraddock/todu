import type { DocHandle, DocumentId } from "@automerge/automerge-repo";
import type { Repo } from "@automerge/automerge-repo";

/**
 * Observe changes across all documents in a Repo.
 *
 * Subscribes to "change" events on every existing document handle and
 * automatically subscribes to new documents as they are created or
 * discovered (via the Repo "document" event).
 *
 * Changes are coalesced: multiple document changes within the same
 * microtask batch fire the callback only once.
 *
 * @returns A cleanup function that removes all listeners.
 */
export function observeAllChanges(repo: Repo, callback: () => void): () => void {
  const observed = new Set<DocumentId>();
  let pending = false;

  function coalesced(): void {
    if (!pending) {
      pending = true;
      // Use queueMicrotask to coalesce multiple synchronous changes
      // into a single callback invocation.
      queueMicrotask(() => {
        pending = false;
        callback();
      });
    }
  }

  function observe(handle: DocHandle<unknown>): void {
    if (observed.has(handle.documentId)) return;
    observed.add(handle.documentId);
    handle.on("change", coalesced);
  }

  // Subscribe to all existing document handles
  for (const handle of Object.values(repo.handles)) {
    observe(handle);
  }

  // Subscribe to new documents as they appear
  function onDocument({ handle }: { handle: DocHandle<unknown> }): void {
    observe(handle);
  }
  repo.on("document", onDocument);

  // Cleanup: remove all listeners
  return () => {
    repo.off("document", onDocument);
    for (const handle of Object.values(repo.handles)) {
      if (observed.has(handle.documentId)) {
        handle.off("change", coalesced);
      }
    }
    observed.clear();
  };
}
