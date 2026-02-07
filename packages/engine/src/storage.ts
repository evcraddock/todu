import fs from "node:fs";
import path from "node:path";
import { Repo } from "@automerge/automerge-repo";
import type { DocHandle, DocumentId } from "@automerge/automerge-repo";
import { NodeFSStorageAdapter } from "@automerge/automerge-repo-storage-nodefs";
import {
  CATALOG_DOC_KEY,
  type CatalogDocument,
  SCHEMA_VERSION,
  createEmptyCatalog,
} from "@todu/core";

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
    migrateCatalog(handle);
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

/**
 * Migrate an existing catalog document to the current schema.
 * Backfills any missing fields that were added in later versions.
 * This ensures engine code can always assume catalog fields exist.
 */
function migrateCatalog(handle: DocHandle<CatalogDocument>): void {
  const doc = handle.doc();
  if (!doc) return;

  const defaults = createEmptyCatalog();
  let needsMigration = false;

  // Check for missing fields
  if (!Array.isArray(doc.projects)) needsMigration = true;
  if (!Array.isArray(doc.labels)) needsMigration = true;
  if (doc.taskListDocIds === undefined || doc.taskListDocIds === null) needsMigration = true;
  if (doc.settings === undefined || doc.settings === null) needsMigration = true;
  if (doc.version === undefined || doc.version === null) needsMigration = true;

  if (!needsMigration) return;

  handle.change((d) => {
    if (!Array.isArray(d.projects)) d.projects = defaults.projects;
    if (!Array.isArray(d.labels)) d.labels = defaults.labels;
    if (d.taskListDocIds === undefined || d.taskListDocIds === null)
      d.taskListDocIds = defaults.taskListDocIds;
    if (d.settings === undefined || d.settings === null) d.settings = defaults.settings;
    if (d.version === undefined || d.version === null) d.version = SCHEMA_VERSION;
  });
}
