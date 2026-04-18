import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { DocHandle, DocumentId } from "@automerge/automerge-repo/slim";
import { Repo } from "@automerge/automerge-repo/slim";
import { NodeFSStorageAdapter } from "@automerge/automerge-repo-storage-nodefs";
import {
  type Actor,
  type BootstrapOwnerActor,
  CATALOG_DOC_KEY,
  type CatalogDocument,
  createActorId,
  createEmptyCatalog,
  createNotesDocument,
  DEFAULT_OWNER_ACTOR_ID,
  type ImportedContentApproval,
  type IntegrationRegistryDocument,
  type Note,
  type NotesDocument,
  SCHEMA_VERSION,
  type TaskDetailDocument,
  type TaskListDocument,
} from "@todu/core";
import { ensureAutomergeWasmInitialized } from "./automerge-init.js";

// ============================================================================
// Storage layer — Automerge repo + document management
// ============================================================================

/** Sync message throttle interval in Automerge (see helpers/throttle.js) */
const SYNC_THROTTLE_MS = 100;
/** Extra time after sync message generation for WebSocket delivery */
const SYNC_DELIVERY_MS = 20;
/** Catalog load timeout for startup and join checks */
const CATALOG_LOAD_TIMEOUT_MS = 10_000;

type MutableLegacyTask = TaskListDocument["tasks"][number] & {
  labels?: string[];
  assigneeActorIds?: string[];
  assignees?: string[];
};

type MutableLegacyNote = Note & {
  author?: string;
  authorActorId?: string;
};

interface LegacyActorRegistry {
  ownerActorId: string;
  actorIds: Set<string>;
  normalizedNameToActorId: Map<string, string>;
  newActors: Actor[];
}

function normalizeLegacyActorName(name: string | null | undefined): string | null {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
}

function createStableLegacyActorId(normalizedName: string, existingActorIds: Set<string>): string {
  const hash = crypto.createHash("sha1").update(normalizedName).digest("hex");
  let candidate = `actor-legacy-${hash}`;
  let suffix = 1;

  while (existingActorIds.has(candidate)) {
    candidate = `actor-legacy-${hash}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function isLegacyActorId(actorId: string): boolean {
  return actorId.startsWith("actor-legacy-");
}

function shouldPreferCanonicalActor(
  ownerActorId: string | undefined,
  candidateActorId: string,
  currentActorId: string,
): boolean {
  if (candidateActorId === currentActorId) return false;
  if (candidateActorId === ownerActorId) return true;
  if (currentActorId === ownerActorId) return false;

  const candidateIsLegacy = isLegacyActorId(candidateActorId);
  const currentIsLegacy = isLegacyActorId(currentActorId);
  if (candidateIsLegacy !== currentIsLegacy) {
    return !candidateIsLegacy;
  }

  return false;
}

function buildCanonicalActorIdsByNormalizedName(doc: CatalogDocument): Map<string, string> {
  const canonicalActorIds = new Map<string, string>();

  for (const actor of doc.actors ?? []) {
    const normalizedName = normalizeLegacyActorName(actor.displayName);
    if (!normalizedName) continue;

    const currentActorId = canonicalActorIds.get(normalizedName);
    if (
      currentActorId === undefined ||
      shouldPreferCanonicalActor(doc.ownerActorId, actor.id, currentActorId)
    ) {
      canonicalActorIds.set(normalizedName, actor.id);
    }
  }

  return canonicalActorIds;
}

function buildActorCanonicalRewriteMap(doc: CatalogDocument): Map<string, string> {
  const canonicalActorIds = buildCanonicalActorIdsByNormalizedName(doc);
  const rewriteMap = new Map<string, string>();

  for (const actor of doc.actors ?? []) {
    const normalizedName = normalizeLegacyActorName(actor.displayName);
    if (!normalizedName) continue;

    const canonicalActorId = canonicalActorIds.get(normalizedName);
    if (canonicalActorId && canonicalActorId !== actor.id) {
      rewriteMap.set(actor.id, canonicalActorId);
    }
  }

  return rewriteMap;
}

function rewriteActorId<T extends string | undefined>(
  actorId: T,
  rewriteMap: ReadonlyMap<string, string>,
): T {
  if (actorId === undefined) return actorId;
  return (rewriteMap.get(actorId) ?? actorId) as T;
}

function rewriteImportedContentApproval(
  approval: ImportedContentApproval | undefined,
  rewriteMap: ReadonlyMap<string, string>,
): void {
  if (!approval) return;

  const nextReviewedByActorId = rewriteActorId(approval.reviewedByActorId, rewriteMap);
  if (nextReviewedByActorId !== approval.reviewedByActorId && nextReviewedByActorId !== undefined) {
    approval.reviewedByActorId = createActorId(nextReviewedByActorId);
  }

  const nextSourceActorId = rewriteActorId(approval.sourceActorId, rewriteMap);
  if (nextSourceActorId !== approval.sourceActorId && nextSourceActorId !== undefined) {
    approval.sourceActorId = createActorId(nextSourceActorId);
  }
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function noteBucketKeyForNote(note: Note): string {
  if (note.entityType && note.entityId) {
    return `entity:${note.entityType}:${note.entityId}`;
  }

  return `journal:${note.createdAt.slice(0, 7)}`;
}

function cloneNote(note: MutableLegacyNote): Note {
  const cloned: Note = {
    id: note.id,
    content: note.content,
    author: note.author ?? "user",
    tags: [...(note.tags ?? [])],
    createdAt: note.createdAt,
  };

  if (note.authorActorId !== undefined) {
    cloned.authorActorId = createActorId(note.authorActorId);
  }
  if (note.entityType !== undefined) cloned.entityType = note.entityType;
  if (note.entityId !== undefined) cloned.entityId = note.entityId;

  return cloned;
}

function buildLegacyActorRegistry(doc: CatalogDocument): LegacyActorRegistry {
  const ownerActorId = doc.ownerActorId ?? DEFAULT_OWNER_ACTOR_ID;
  const actorIds = new Set<string>();
  const normalizedNameToActorId = new Map<string, string>();

  for (const actor of doc.actors ?? []) {
    actorIds.add(actor.id);
    const normalizedName = normalizeLegacyActorName(actor.displayName);
    if (normalizedName && !normalizedNameToActorId.has(normalizedName)) {
      normalizedNameToActorId.set(normalizedName, actor.id);
    }
  }

  actorIds.add(ownerActorId);
  normalizedNameToActorId.set("user", ownerActorId);

  const ownerActor = (doc.actors ?? []).find((actor) => actor.id === ownerActorId);
  const ownerNormalizedName = normalizeLegacyActorName(ownerActor?.displayName);
  if (ownerNormalizedName) {
    normalizedNameToActorId.set(ownerNormalizedName, ownerActorId);
  }

  return {
    ownerActorId,
    actorIds,
    normalizedNameToActorId,
    newActors: [],
  };
}

function resolveLegacyActorId(
  registry: LegacyActorRegistry,
  rawName: string | null | undefined,
): string {
  const normalizedName = normalizeLegacyActorName(rawName);
  if (!normalizedName || normalizedName === "user") {
    return registry.ownerActorId;
  }

  const existingActorId = registry.normalizedNameToActorId.get(normalizedName);
  if (existingActorId) {
    return existingActorId;
  }

  const actorId = createStableLegacyActorId(normalizedName, registry.actorIds);
  const displayName = rawName?.trim() || normalizedName;
  registry.actorIds.add(actorId);
  registry.normalizedNameToActorId.set(normalizedName, actorId);
  registry.newActors.push({ id: createActorId(actorId), displayName });
  return actorId;
}

function migrateLegacyAssigneeActorIds(
  registry: LegacyActorRegistry,
  legacyAssignees: readonly string[] | null | undefined,
): string[] {
  const actorIds: string[] = [];
  const seen = new Set<string>();

  for (const assignee of legacyAssignees ?? []) {
    const actorId = resolveLegacyActorId(registry, assignee);
    if (!seen.has(actorId)) {
      seen.add(actorId);
      actorIds.push(actorId);
    }
  }

  return actorIds;
}

/**
 * Wait for pending sync messages to be generated and delivered.
 *
 * Automerge batches sync messages on a ~100ms throttle. After a mutation,
 * we wait for the "generate-sync-message" event (confirming the change was
 * packaged for sending), then yield briefly for the WebSocket to deliver
 * the bytes. If no sync message arrives within the throttle window,
 * there's nothing pending — return immediately.
 */
async function waitForSyncFlush(repo: Repo, documentId: DocumentId): Promise<void> {
  return new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      repo.off("doc-metrics", onMetrics);
      resolve();
    }, SYNC_THROTTLE_MS + SYNC_DELIVERY_MS);

    function onMetrics(m: { type: string; documentId: DocumentId }) {
      if (m.type === "generate-sync-message" && m.documentId === documentId) {
        repo.off("doc-metrics", onMetrics);
        clearTimeout(timeout);
        // Yield for WebSocket to deliver the bytes
        setTimeout(resolve, SYNC_DELIVERY_MS);
      }
    }

    repo.on("doc-metrics", onMetrics);
  });
}

function getCatalogMarkerPath(storagePath: string): string {
  return path.join(storagePath, `${CATALOG_DOC_KEY}.id`);
}

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

export interface CatalogJoinSwitch {
  /** Catalog marker that was active before this switch started */
  previousCatalogId: DocumentId | null;

  /** Target catalog marker requested by join */
  targetCatalogId: DocumentId;

  /** Finalize the switch after join validation/sync succeeds */
  commit(): void;

  /** Restore prior catalog marker if the join attempt fails */
  rollback(): void;
}

/**
 * Begin a catalog marker switch for join flows.
 *
 * This is the storage-layer entrypoint that explicit join workflows use.
 * The caller should:
 * 1) validate target catalog reachability,
 * 2) perform switch-dependent work,
 * 3) call commit() on success or rollback() on failure.
 */
export function beginCatalogJoinSwitch(
  storagePath: string,
  targetCatalogId: DocumentId,
): CatalogJoinSwitch {
  const markerPath = getCatalogMarkerPath(storagePath);
  const previousCatalogId = fs.existsSync(markerPath)
    ? (fs.readFileSync(markerPath, "utf-8").trim() as DocumentId)
    : null;

  fs.writeFileSync(markerPath, targetCatalogId, "utf-8");

  return {
    previousCatalogId,
    targetCatalogId,
    commit(): void {
      // Marker already points at target; nothing else needed yet.
    },
    rollback(): void {
      if (previousCatalogId) {
        fs.writeFileSync(markerPath, previousCatalogId, "utf-8");
      } else if (fs.existsSync(markerPath)) {
        fs.unlinkSync(markerPath);
      }
    },
  };
}

/**
 * Initialize persistent storage for bootstrap flows.
 *
 * Bootstrap behavior:
 * - No marker: create initial catalog
 * - Existing marker: load that catalog
 * - Existing but unreachable marker: fail (do not implicitly create a new catalog)
 */
export async function initBootstrapStorage(
  storagePath: string,
  repo?: Repo,
  bootstrapOwnerActor?: BootstrapOwnerActor,
): Promise<Storage> {
  await ensureAutomergeWasmInitialized();
  fs.mkdirSync(storagePath, { recursive: true });

  const ownsRepo = repo === undefined;
  const actualRepo =
    repo ??
    new Repo({
      storage: new NodeFSStorageAdapter(storagePath),
    });

  try {
    const catalog = await loadOrBootstrapCatalog(actualRepo, storagePath, bootstrapOwnerActor);
    return createPersistentStorage(actualRepo, catalog);
  } catch (error) {
    if (ownsRepo) {
      await shutdownRepoQuietly(actualRepo);
    }
    throw error;
  }
}

/**
 * Initialize persistent storage for explicit join flows.
 *
 * Join behavior:
 * - Requires the target catalog to be reachable
 * - Never creates a fresh catalog implicitly
 */
export async function initJoinStorage(
  storagePath: string,
  targetCatalogId: DocumentId,
  repo?: Repo,
  bootstrapOwnerActor?: BootstrapOwnerActor,
): Promise<Storage> {
  await ensureAutomergeWasmInitialized();
  fs.mkdirSync(storagePath, { recursive: true });

  const ownsRepo = repo === undefined;
  const actualRepo =
    repo ??
    new Repo({
      storage: new NodeFSStorageAdapter(storagePath),
    });

  try {
    const catalog = await loadCatalogById(actualRepo, targetCatalogId, "join", bootstrapOwnerActor);
    return createPersistentStorage(actualRepo, catalog);
  } catch (error) {
    if (ownsRepo) {
      await shutdownRepoQuietly(actualRepo);
    }
    throw error;
  }
}

/**
 * Backward-compatible storage initialization entrypoint.
 *
 * Defaults to bootstrap semantics.
 */
export async function initStorage(storagePath: string, repo?: Repo): Promise<Storage> {
  return initBootstrapStorage(storagePath, repo);
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
  await ensureAutomergeWasmInitialized();

  // Read the catalog document ID from the marker file
  const markerPath = getCatalogMarkerPath(storagePath);
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
          // Wait for any pending mutations to be synced to the server.
          // Automerge throttles sync messages (~100ms batches), so after
          // a change() call the sync message won't be sent immediately.
          // We listen for the "generate-sync-message" event to know the
          // message was queued, then yield briefly for the WebSocket to
          // deliver the bytes before shutting down.
          await waitForSyncFlush(repo, docId);

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

async function shutdownRepoQuietly(repo: Repo): Promise<void> {
  try {
    await repo.flush();
  } catch {
    // Safe to ignore — requesting docs have no content to save
  }

  try {
    await repo.shutdown();
  } catch {
    // Safe to ignore — shutdown may race with pending requesting docs
  }

  // Allow queued storage adapter writes to settle before callers clean up
  // temporary directories. A full sync-throttle window avoids ENOENT races
  // observed in repeated failure-path teardown tests.
  await new Promise((resolve) => setTimeout(resolve, SYNC_THROTTLE_MS + SYNC_DELIVERY_MS));
}

function createPersistentStorage(repo: Repo, catalog: DocHandle<CatalogDocument>): Storage {
  return {
    repo,
    catalog,
    ephemeral: false,
    async close() {
      // Both flush() and shutdown() (which calls flush internally) can throw
      // "DocHandle is not ready" when a document is in "requesting" state —
      // this happens when a connected remote peer is mid-sync during close.
      // Requesting documents have no local content to persist, so ignoring
      // the error is safe and correct.
      try {
        await repo.flush();
      } catch {
        // Safe to ignore — requesting docs have no content to save
      }
      try {
        await repo.shutdown();
      } catch {
        // shutdown() calls flush() internally — same safe-to-ignore error
      }
    },
  };
}

/**
 * Load existing catalog document from marker if present.
 * If no marker exists, bootstrap a new catalog.
 */
async function loadOrBootstrapCatalog(
  repo: Repo,
  storagePath: string,
  bootstrapOwnerActor?: BootstrapOwnerActor,
): Promise<DocHandle<CatalogDocument>> {
  const markerPath = getCatalogMarkerPath(storagePath);

  if (fs.existsSync(markerPath)) {
    const docId = fs.readFileSync(markerPath, "utf-8").trim() as DocumentId;
    return loadCatalogById(repo, docId, "bootstrap", bootstrapOwnerActor);
  }

  return createBootstrapCatalog(repo, markerPath, bootstrapOwnerActor);
}

/**
 * Load an existing catalog by ID and run schema migration if needed.
 * Does not create a replacement catalog on failure.
 */
async function loadCatalogById(
  repo: Repo,
  docId: DocumentId,
  mode: "bootstrap" | "join",
  bootstrapOwnerActor?: BootstrapOwnerActor,
): Promise<DocHandle<CatalogDocument>> {
  try {
    const handle = await repo.find<CatalogDocument>(docId, {
      signal: AbortSignal.timeout(CATALOG_LOAD_TIMEOUT_MS),
    });
    migrateCatalog(handle, bootstrapOwnerActor);
    await migrateLegacyIdentityModel(handle, repo);
    await repairCanonicalActorReferences(handle, repo);
    return handle;
  } catch {
    throw new Error(
      `[storage] ${mode} catalog ${docId} not reachable within ${CATALOG_LOAD_TIMEOUT_MS}ms`,
    );
  }
}

/**
 * Create a new catalog and persist its marker.
 */
function createBootstrapCatalog(
  repo: Repo,
  markerPath: string,
  bootstrapOwnerActor?: BootstrapOwnerActor,
): DocHandle<CatalogDocument> {
  const handle = repo.create<CatalogDocument>();
  handle.change((doc: CatalogDocument) => {
    const empty = createEmptyCatalog(bootstrapOwnerActor);
    doc.version = empty.version;
    doc.projects = empty.projects;
    doc.labels = empty.labels;
    doc.actors = empty.actors;
    doc.ownerActorId = empty.ownerActorId;
    doc.recurringTemplates = empty.recurringTemplates;
    doc.habits = empty.habits;
    doc.habitLogDocIds = empty.habitLogDocIds;
    doc.taskListDocIds = empty.taskListDocIds;
    doc.notesBucketDocIds = empty.notesBucketDocIds;
    doc.noteBucketByNoteId = empty.noteBucketByNoteId;
    doc.integrationStatusDocIds = empty.integrationStatusDocIds;
    doc.settings = empty.settings;
  });

  fs.writeFileSync(markerPath, handle.documentId, "utf-8");

  return handle;
}

/**
 * Migrate an existing catalog document to the current schema.
 * Backfills any missing fields that were added in later versions.
 * This ensures engine code can always assume catalog fields exist.
 */
function migrateCatalog(
  handle: DocHandle<CatalogDocument>,
  bootstrapOwnerActor?: BootstrapOwnerActor,
): void {
  const doc = handle.doc();
  if (!doc) return;

  const defaults = createEmptyCatalog(bootstrapOwnerActor);
  let needsMigration = false;

  // Check for missing fields
  if (!Array.isArray(doc.projects)) needsMigration = true;
  if (!Array.isArray(doc.labels)) needsMigration = true;
  if (!Array.isArray(doc.actors) || doc.actors.length === 0) needsMigration = true;
  if (doc.ownerActorId === undefined || doc.ownerActorId === null) needsMigration = true;
  if (!Array.isArray(doc.recurringTemplates)) needsMigration = true;
  if (!Array.isArray(doc.habits)) needsMigration = true;
  if (doc.taskListDocIds === undefined || doc.taskListDocIds === null) needsMigration = true;
  if (doc.habitLogDocIds === undefined || doc.habitLogDocIds === null) needsMigration = true;
  if (doc.notesBucketDocIds === undefined || doc.notesBucketDocIds === null) needsMigration = true;
  if (doc.noteBucketByNoteId === undefined || doc.noteBucketByNoteId === null)
    needsMigration = true;
  if (doc.integrationStatusDocIds === undefined || doc.integrationStatusDocIds === null)
    needsMigration = true;
  if (doc.settings === undefined || doc.settings === null) needsMigration = true;
  if (doc.version === undefined || doc.version === null) needsMigration = true;
  if (doc.settings?.schemaVersion === undefined || doc.settings?.schemaVersion === null) {
    needsMigration = true;
  }
  if (doc.projects?.some((project) => project.authorizedAssigneeActorIds === undefined)) {
    needsMigration = true;
  }

  if (!needsMigration) return;

  handle.change((d) => {
    if (!Array.isArray(d.projects)) d.projects = defaults.projects;
    if (!Array.isArray(d.labels)) d.labels = defaults.labels;
    if (!Array.isArray(d.actors) || d.actors.length === 0) d.actors = defaults.actors;
    if (d.ownerActorId === undefined || d.ownerActorId === null) {
      d.ownerActorId = defaults.ownerActorId;
    }
    if (!Array.isArray(d.recurringTemplates)) d.recurringTemplates = defaults.recurringTemplates;
    if (!Array.isArray(d.habits)) d.habits = defaults.habits;
    if (d.taskListDocIds === undefined || d.taskListDocIds === null)
      d.taskListDocIds = defaults.taskListDocIds;
    if (d.habitLogDocIds === undefined || d.habitLogDocIds === null)
      d.habitLogDocIds = defaults.habitLogDocIds;
    if (d.notesBucketDocIds === undefined || d.notesBucketDocIds === null)
      d.notesBucketDocIds = defaults.notesBucketDocIds;
    if (d.noteBucketByNoteId === undefined || d.noteBucketByNoteId === null)
      d.noteBucketByNoteId = defaults.noteBucketByNoteId;
    if (d.integrationStatusDocIds === undefined || d.integrationStatusDocIds === null)
      d.integrationStatusDocIds = defaults.integrationStatusDocIds;
    if (d.settings === undefined || d.settings === null) {
      d.settings = { schemaVersion: d.version ?? 1 };
    } else if (d.settings.schemaVersion === undefined || d.settings.schemaVersion === null) {
      d.settings.schemaVersion = d.version ?? 1;
    }
    if (d.version === undefined || d.version === null) d.version = 1;
    for (const project of d.projects) {
      if (
        project.authorizedAssigneeActorIds === undefined ||
        project.authorizedAssigneeActorIds === null
      ) {
        project.authorizedAssigneeActorIds = d.ownerActorId ? [d.ownerActorId] : [];
      }
    }
  });
}

async function repairCanonicalActorReferences(
  catalog: DocHandle<CatalogDocument>,
  repo: Repo,
): Promise<void> {
  const catalogDoc = catalog.doc();
  if (!catalogDoc) return;

  const rewriteMap = buildActorCanonicalRewriteMap(catalogDoc);
  if (rewriteMap.size === 0) return;

  catalog.change((doc) => {
    for (const project of doc.projects) {
      if (!project.authorizedAssigneeActorIds) continue;

      const nextAuthorizedActorIds: string[] = [];
      const seenActorIds = new Set<string>();
      for (const actorId of project.authorizedAssigneeActorIds) {
        const nextActorId = rewriteMap.get(actorId) ?? actorId;
        if (!seenActorIds.has(nextActorId)) {
          seenActorIds.add(nextActorId);
          nextAuthorizedActorIds.push(nextActorId);
        }
      }

      if (!arraysEqual(project.authorizedAssigneeActorIds, nextAuthorizedActorIds)) {
        project.authorizedAssigneeActorIds.splice(
          0,
          project.authorizedAssigneeActorIds.length,
          ...nextAuthorizedActorIds.map((actorId) => createActorId(actorId)),
        );
      }
    }
  });

  const currentCatalog = catalog.doc();
  for (const docId of Object.values(currentCatalog?.taskListDocIds ?? {})) {
    const handle = await repo.find<TaskListDocument>(docId as DocumentId);
    await handle.whenReady();
    handle.change((doc) => {
      for (const task of doc.tasks as MutableLegacyTask[]) {
        if (!task.assigneeActorIds || task.assigneeActorIds.length === 0) continue;

        const nextAssigneeActorIds: string[] = [];
        const seenActorIds = new Set<string>();
        for (const actorId of task.assigneeActorIds) {
          const nextActorId = rewriteMap.get(actorId) ?? actorId;
          if (!seenActorIds.has(nextActorId)) {
            seenActorIds.add(nextActorId);
            nextAssigneeActorIds.push(nextActorId);
          }
        }

        if (!arraysEqual(task.assigneeActorIds, nextAssigneeActorIds)) {
          task.assigneeActorIds.splice(0, task.assigneeActorIds.length, ...nextAssigneeActorIds);
        }
      }
    });

    for (const detailDocId of Object.values(handle.doc()?.detailDocIds ?? {})) {
      const detailHandle = await repo.find<TaskDetailDocument>(detailDocId as DocumentId);
      await detailHandle.whenReady();
      detailHandle.change((doc) => {
        rewriteImportedContentApproval(doc.descriptionApproval, rewriteMap);
      });
    }
  }

  for (const docId of Object.values(catalog.doc()?.notesBucketDocIds ?? {})) {
    const handle = await repo.find<NotesDocument>(docId as DocumentId);
    await handle.whenReady();
    handle.change((doc) => {
      for (const note of doc.notes as MutableLegacyNote[]) {
        const nextAuthorActorId = rewriteActorId(note.authorActorId, rewriteMap);
        if (nextAuthorActorId !== note.authorActorId) {
          note.authorActorId = nextAuthorActorId ? createActorId(nextAuthorActorId) : undefined;
        }
        rewriteImportedContentApproval(note.contentApproval, rewriteMap);
      }
    });
  }

  const integrationRegistryDocId = catalog.doc()?.integrationRegistryDocId;
  if (integrationRegistryDocId) {
    const integrationHandle = await repo.find<IntegrationRegistryDocument>(
      integrationRegistryDocId as DocumentId,
    );
    await integrationHandle.whenReady();
    integrationHandle.change((doc) => {
      for (const binding of doc.bindings) {
        for (const mapping of binding.options?.actorMappings ?? []) {
          const nextActorId = rewriteActorId(mapping.actorId, rewriteMap);
          if (nextActorId !== mapping.actorId) {
            mapping.actorId = createActorId(nextActorId);
          }
        }
      }
    });
  }

  catalog.change((doc) => {
    doc.actors = doc.actors.filter((actor) => !rewriteMap.has(actor.id));
  });
}

async function migrateLegacyIdentityModel(
  catalog: DocHandle<CatalogDocument>,
  repo: Repo,
): Promise<void> {
  const catalogDoc = catalog.doc();
  if (!catalogDoc) return;

  const currentSchemaVersion = catalogDoc.settings?.schemaVersion ?? catalogDoc.version ?? 1;
  if (currentSchemaVersion >= SCHEMA_VERSION) return;

  const registry = buildLegacyActorRegistry(catalogDoc);
  const projectAssignedActorIds = await migrateLegacyTaskAssignments(catalog, repo, registry);
  await migrateLegacyNotes(catalog, repo, registry);

  catalog.change((doc) => {
    if (registry.newActors.length > 0) {
      doc.actors.push(...registry.newActors);
    }

    for (const project of doc.projects) {
      const nextAuthorizedActorIds = new Set<string>(project.authorizedAssigneeActorIds ?? []);
      nextAuthorizedActorIds.add(registry.ownerActorId);
      for (const actorId of projectAssignedActorIds.get(project.id) ?? []) {
        nextAuthorizedActorIds.add(actorId);
      }

      const nextAuthorized = [...nextAuthorizedActorIds];
      if (!arraysEqual(project.authorizedAssigneeActorIds ?? [], nextAuthorized)) {
        project.authorizedAssigneeActorIds.splice(
          0,
          project.authorizedAssigneeActorIds.length,
          ...nextAuthorized.map((actorId) => createActorId(actorId)),
        );
      }
    }

    doc.version = SCHEMA_VERSION;
    doc.settings.schemaVersion = SCHEMA_VERSION;
  });
}

async function migrateLegacyTaskAssignments(
  catalog: DocHandle<CatalogDocument>,
  repo: Repo,
  registry: LegacyActorRegistry,
): Promise<Map<string, Set<string>>> {
  const projectAssignedActorIds = new Map<string, Set<string>>();
  const catalogDoc = catalog.doc();
  if (!catalogDoc) return projectAssignedActorIds;

  for (const [projectId, docId] of Object.entries(catalogDoc.taskListDocIds ?? {})) {
    const handle = await repo.find<TaskListDocument>(docId as DocumentId);
    await handle.whenReady();
    const taskListDoc = handle.doc();
    if (!taskListDoc) continue;

    handle.change((doc) => {
      for (const task of doc.tasks as MutableLegacyTask[]) {
        if (task.labels === undefined || task.labels === null) {
          task.labels = [];
        }
        if (task.assigneeActorIds === undefined || task.assigneeActorIds === null) {
          task.assigneeActorIds = [];
        }
        if (task.assignees === undefined || task.assignees === null) {
          task.assignees = [];
        }

        const hasMissingActorReferences = task.assigneeActorIds.some(
          (actorId) => !registry.actorIds.has(actorId),
        );
        if (
          task.assignees.length > 0 &&
          (task.assigneeActorIds.length === 0 || hasMissingActorReferences)
        ) {
          const migratedActorIds = migrateLegacyAssigneeActorIds(registry, task.assignees);
          task.assigneeActorIds.splice(0, task.assigneeActorIds.length, ...migratedActorIds);
        }

        let assigned = projectAssignedActorIds.get(projectId);
        if (!assigned) {
          assigned = new Set<string>();
          projectAssignedActorIds.set(projectId, assigned);
        }
        for (const actorId of task.assigneeActorIds) {
          assigned.add(actorId);
        }
      }
    });
  }

  return projectAssignedActorIds;
}

async function migrateLegacyNotes(
  catalog: DocHandle<CatalogDocument>,
  repo: Repo,
  registry: LegacyActorRegistry,
): Promise<void> {
  const catalogDoc = catalog.doc();
  if (!catalogDoc) return;

  if (catalogDoc.notesBucketDocIds === undefined || catalogDoc.notesBucketDocIds === null) {
    catalog.change((doc) => {
      doc.notesBucketDocIds = {};
    });
  }
  if (catalogDoc.noteBucketByNoteId === undefined || catalogDoc.noteBucketByNoteId === null) {
    catalog.change((doc) => {
      doc.noteBucketByNoteId = {};
    });
  }

  if (catalogDoc.notesDocId) {
    const legacyHandle = await repo.find<NotesDocument>(catalogDoc.notesDocId as DocumentId);
    await legacyHandle.whenReady();
    const legacyNotes = (legacyHandle.doc()?.notes ?? []).map((note) => cloneNote(note));

    const notesByBucket = new Map<string, Note[]>();
    for (const note of legacyNotes) {
      const bucketKey = noteBucketKeyForNote(note);
      const bucketNotes = notesByBucket.get(bucketKey);
      if (bucketNotes) {
        bucketNotes.push(note);
      } else {
        notesByBucket.set(bucketKey, [note]);
      }
    }

    for (const [bucketKey, notes] of notesByBucket) {
      const existingBucketId = catalog.doc()?.notesBucketDocIds?.[bucketKey];
      const bucketHandle = existingBucketId
        ? await repo.find<NotesDocument>(existingBucketId as DocumentId)
        : repo.create<NotesDocument>();
      await bucketHandle.whenReady();
      if (!existingBucketId) {
        const empty = createNotesDocument();
        bucketHandle.change((doc) => {
          doc.notes = empty.notes;
        });
        catalog.change((doc) => {
          doc.notesBucketDocIds[bucketKey] = bucketHandle.documentId;
        });
      }

      bucketHandle.change((doc) => {
        const existingIds = new Set(doc.notes.map((note) => note.id));
        for (const note of notes) {
          if (!existingIds.has(note.id)) {
            doc.notes.push(note);
            existingIds.add(note.id);
          }
        }
      });
    }

    catalog.change((doc) => {
      delete doc.notesDocId;
      doc.noteBucketByNoteId = {};
    });

    legacyHandle.change((doc) => {
      doc.notes.splice(0, doc.notes.length);
    });
  }

  for (const docId of Object.values(catalog.doc()?.notesBucketDocIds ?? {})) {
    const handle = await repo.find<NotesDocument>(docId as DocumentId);
    await handle.whenReady();
    handle.change((doc) => {
      for (const note of doc.notes as MutableLegacyNote[]) {
        const hasMissingAuthorActor =
          note.authorActorId === undefined ||
          note.authorActorId === null ||
          !registry.actorIds.has(note.authorActorId);
        if (hasMissingAuthorActor) {
          note.authorActorId = createActorId(resolveLegacyActorId(registry, note.author));
        }
        if (note.author === undefined || note.author === null || note.author.trim() === "") {
          note.author = "user";
        }
      }
    });
  }

  if (Object.keys(catalog.doc()?.noteBucketByNoteId ?? {}).length > 0) {
    catalog.change((doc) => {
      doc.noteBucketByNoteId = {};
    });
  }
}
