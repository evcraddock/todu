import type { DocHandle, DocumentId, Repo } from "@automerge/automerge-repo";

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
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  function coalesced(): void {
    if (!pending) {
      pending = true;
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

  /** Scan repo.handles for any new unobserved handles. */
  function scanForNewHandles(): void {
    for (const handle of Object.values(repo.handles)) {
      observe(handle);
    }
  }

  // Subscribe to all existing document handles
  scanForNewHandles();

  // The Repo "document" event may not fire in all versions of automerge-repo,
  // so we also poll for new handles periodically. The poll is cheap — just
  // iterating a map and checking a Set.
  function onDocument({ handle }: { handle: DocHandle<unknown> }): void {
    observe(handle);
  }
  repo.on("document", onDocument);

  // Poll every 2 seconds for new document handles that weren't caught by the event
  pollTimer = setInterval(scanForNewHandles, 2000);

  // Cleanup: remove all listeners
  return () => {
    repo.off("document", onDocument);
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    for (const handle of Object.values(repo.handles)) {
      if (observed.has(handle.documentId)) {
        handle.off("change", coalesced);
      }
    }
    observed.clear();
  };
}
