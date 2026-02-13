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

  /** Whether this storage is ephemeral (in-memory, no persistence) */
  ephemeral: boolean;

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
    ephemeral: false,
    async close() {
      await repo.flush();
      await repo.shutdown();
    },
  };
}

/**
 * Initialize ephemeral storage with no filesystem persistence.
 * Used by CLI when syncing with a running Electron instance.
 *
 * Creates an in-memory Automerge repo and reads the catalog document ID
 * from the marker file (written by the persistent owner).
 *
 * IMPORTANT: The caller must connect a sync adapter to the repo BEFORE
 * calling `findCatalog()`. The ephemeral repo has no local data — it
 * needs a sync peer to provide the document contents.
 */
export async function initEphemeralStorage(storagePath: string): Promise<
  Omit<Storage, "catalog"> & {
    /** Find the catalog document via sync. Call AFTER connecting a sync adapter. */
    findCatalog(): Promise<Storage>;
  }
> {
  // Read the catalog document ID from the marker file
  const markerPath = path.join(storagePath, `${CATALOG_DOC_KEY}.id`);
  if (!fs.existsSync(markerPath)) {
    throw new Error(
      "No catalog marker found. Run the Electron app or CLI standalone first to create data.",
    );
  }
  const docId = fs.readFileSync(markerPath, "utf-8").trim() as DocumentId;

  // Create repo with no storage — purely in-memory
  const repo = new Repo({});

  return {
    repo,
    ephemeral: true,
    async close() {
      try {
        await repo.shutdown();
      } catch {
        // Safe to ignore — adapters may already be disconnected
      }
    },
    async findCatalog(): Promise<Storage> {
      // Now that sync is connected, find the catalog document.
      // Allow "requesting" state so find() doesn't fail while waiting
      // for the sync peer to deliver the document data.
      const catalog = await repo.find<CatalogDocument>(docId, {
        allowableStates: ["ready", "requesting", "loading"],
      });

      // Wait for the document to actually be ready (populated via sync)
      await catalog.whenReady();

      return {
        repo,
        catalog,
        ephemeral: true,
        async close() {
          // Shutdown may trigger disconnect on adapters that are already
          // closed. Wrap to avoid assertion errors from WebSocket adapter.
          try {
            await repo.shutdown();
          } catch {
            // Safe to ignore — adapters may already be disconnected
          }
        },
      };
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
    doc.recurringTemplates = empty.recurringTemplates;
    doc.habits = empty.habits;
    doc.habitLogDocIds = empty.habitLogDocIds;
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
  if (!Array.isArray(doc.recurringTemplates)) needsMigration = true;
  if (!Array.isArray(doc.habits)) needsMigration = true;
  if (doc.taskListDocIds === undefined || doc.taskListDocIds === null) needsMigration = true;
  if (doc.habitLogDocIds === undefined || doc.habitLogDocIds === null) needsMigration = true;
  if (doc.settings === undefined || doc.settings === null) needsMigration = true;
  if (doc.version === undefined || doc.version === null) needsMigration = true;

  if (!needsMigration) return;

  handle.change((d) => {
    if (!Array.isArray(d.projects)) d.projects = defaults.projects;
    if (!Array.isArray(d.labels)) d.labels = defaults.labels;
    if (!Array.isArray(d.recurringTemplates)) d.recurringTemplates = defaults.recurringTemplates;
    if (!Array.isArray(d.habits)) d.habits = defaults.habits;
    if (d.taskListDocIds === undefined || d.taskListDocIds === null)
      d.taskListDocIds = defaults.taskListDocIds;
    if (d.habitLogDocIds === undefined || d.habitLogDocIds === null)
      d.habitLogDocIds = defaults.habitLogDocIds;
    if (d.settings === undefined || d.settings === null) d.settings = defaults.settings;
    if (d.version === undefined || d.version === null) d.version = SCHEMA_VERSION;
  });
}
