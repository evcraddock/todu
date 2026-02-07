import fs from "node:fs";
import path from "node:path";
import { Repo } from "@automerge/automerge-repo";
import type { DocHandle, DocumentId } from "@automerge/automerge-repo";
import { NodeFSStorageAdapter } from "@automerge/automerge-repo-storage-nodefs";
import { CATALOG_DOC_KEY, type CatalogDocument, createEmptyCatalog } from "@todu/core";

// ============================================================================
// Storage layer — Automerge repo + document management
// ============================================================================

export interface Storage {
  /** The Automerge repo instance */
  repo: Repo;

  /** The catalog document handle */
  catalog: DocHandle<CatalogDocument>;

  /** Shut down the repo */
  close(): Promise<void>;
}

/**
 * Initialize storage: create data directory, set up Automerge repo,
 * and load or create the catalog document.
 */
export async function initStorage(storagePath: string): Promise<Storage> {
  // Ensure data directory exists
  fs.mkdirSync(storagePath, { recursive: true });

  // Create Automerge repo with filesystem storage
  const repo = new Repo({
    storage: new NodeFSStorageAdapter(storagePath),
  });

  // Load or create catalog document
  const catalog = await loadOrCreateCatalog(repo, storagePath);

  return {
    repo,
    catalog,
    async close() {
      await repo.flush();
      await repo.shutdown();
    },
  };
}

/**
 * Load existing catalog document or create a new one.
 * Uses a marker file to store the document ID between sessions.
 */
async function loadOrCreateCatalog(
  repo: Repo,
  storagePath: string,
): Promise<DocHandle<CatalogDocument>> {
  const markerPath = path.join(storagePath, `${CATALOG_DOC_KEY}.id`);

  // Try to load existing catalog
  if (fs.existsSync(markerPath)) {
    const docId = fs.readFileSync(markerPath, "utf-8").trim() as DocumentId;
    const handle = await repo.find<CatalogDocument>(docId);
    return handle;
  }

  // Create new catalog
  const handle = repo.create<CatalogDocument>();
  handle.change((doc: CatalogDocument) => {
    const empty = createEmptyCatalog();
    doc.version = empty.version;
    doc.projects = empty.projects;
    doc.labels = empty.labels;
    doc.taskListDocIds = empty.taskListDocIds;
    doc.settings = empty.settings;
  });

  // Save document ID for next session
  fs.writeFileSync(markerPath, handle.documentId, "utf-8");

  return handle;
}
