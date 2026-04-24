import crypto from "node:crypto";
import type { DocHandle, DocumentId, Repo } from "@automerge/automerge-repo";
import {
  type CatalogDocument,
  type CreateNoteInput,
  createNoteId,
  createNotesDocument,
  dateToTimezoneISO,
  err,
  type ImportedContentApproval,
  type Note,
  type NoteFilter,
  type NoteId,
  type NotesDocument,
  notFound,
  ok,
  type Result,
  type TaskListDocument,
  type UpdateNoteInput,
  validateCreateNoteInput,
  validateNoteFilter,
  validateUpdateNoteInput,
} from "@todu/core";
import type { NoteNamespace } from "./todu.js";

const NOTES_DIAGNOSTICS_ENV = "TODU_NOTES_DIAGNOSTICS";

function createStoredNoteContentFingerprint(content: string): string {
  return `sha1:${crypto.createHash("sha1").update(content).digest("hex")}`;
}

function normalizeStoredNoteContentApproval(
  content: string,
  approval?: ImportedContentApproval,
): ImportedContentApproval {
  return {
    ...(approval ?? { state: "notRequired" }),
    sourceFingerprint: createStoredNoteContentFingerprint(content),
  };
}

interface NoteLocation {
  bucketKey: string;
  handle: DocHandle<NotesDocument>;
  index: number;
}

// ============================================================================
// Note namespace — CRUD on partitioned NotesDocument buckets
// ============================================================================

export function createNoteNamespace(
  catalog: DocHandle<CatalogDocument>,
  repo: Repo,
): NoteNamespace {
  function diagnosticsEnabled(): boolean {
    const value = process.env[NOTES_DIAGNOSTICS_ENV];
    return value === "1" || value?.toLowerCase() === "true";
  }

  function emitDiagnostic(event: string, payload: Record<string, unknown>): void {
    if (!diagnosticsEnabled()) return;
    console.info(`[notes] ${event} ${JSON.stringify(payload)}`);
  }

  function noteBucketKeyForNote(note: Note): string {
    if (note.entityType && note.entityId) {
      return `entity:${note.entityType}:${note.entityId}`;
    }

    // Standalone notes partition by month (YYYY-MM)
    return `journal:${note.createdAt.slice(0, 7)}`;
  }

  function noteBucketKeyForFilter(filter: NoteFilter): string | null {
    if (filter.entityType && filter.entityId) {
      return `entity:${filter.entityType}:${filter.entityId}`;
    }
    return null;
  }

  function normalizeRangeBoundary(
    value: string,
    bound: "start" | "end",
    timezone?: string,
  ): string {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      if (timezone) {
        return dateToTimezoneISO(value, bound, timezone);
      }
      const [year, month, day] = value.split("-").map(Number);
      const time =
        bound === "start"
          ? Date.UTC(year, month - 1, day, 0, 0, 0, 0)
          : Date.UTC(year, month - 1, day, 23, 59, 59, 999);
      return new Date(time).toISOString();
    }

    return new Date(value).toISOString();
  }

  function normalizeNoteFilter(filter?: NoteFilter): NoteFilter | undefined {
    if (!filter) return undefined;

    const normalized: NoteFilter = { ...filter };
    if (filter.createdFrom !== undefined) {
      normalized.createdFrom = normalizeRangeBoundary(filter.createdFrom, "start", filter.timezone);
    }
    if (filter.createdTo !== undefined) {
      normalized.createdTo = normalizeRangeBoundary(filter.createdTo, "end", filter.timezone);
    }

    return normalized;
  }

  function createContentFingerprint(content: string): string {
    return `sha1:${crypto.createHash("sha1").update(content).digest("hex")}`;
  }

  function normalizeContentApproval(
    content: string,
    approval?: ImportedContentApproval,
  ): ImportedContentApproval {
    return {
      ...(approval ?? { state: "notRequired" }),
      sourceFingerprint: createContentFingerprint(content),
    };
  }

  function isJournalBucketKey(bucketKey: string): boolean {
    return bucketKey.startsWith("journal:");
  }

  function journalBucketMatchesCreatedRange(bucketKey: string, filter?: NoteFilter): boolean {
    if (!isJournalBucketKey(bucketKey)) return true;
    if (!filter?.createdFrom && !filter?.createdTo) return true;

    const month = bucketKey.slice("journal:".length);
    if (filter.createdFrom && month < filter.createdFrom.slice(0, 7)) {
      return false;
    }
    if (filter.createdTo && month > filter.createdTo.slice(0, 7)) {
      return false;
    }
    return true;
  }

  function findActorIdByDisplayName(displayName: string): Note["authorActorId"] {
    const catalogDoc = catalog.doc();
    return catalogDoc?.actors.find((actor) => actor.displayName === displayName)?.id;
  }

  function actorExists(actorId: string): boolean {
    const catalogDoc = catalog.doc();
    return catalogDoc?.actors.some((actor) => actor.id === actorId) ?? false;
  }

  function resolveAuthorActorId(input: CreateNoteInput): Note["authorActorId"] {
    if (input.authorActorId !== undefined) {
      return input.authorActorId;
    }

    if (input.author === undefined || input.author === "user") {
      return catalog.doc()?.ownerActorId;
    }

    return findActorIdByDisplayName(input.author);
  }

  async function getBucketHandle(bucketKey: string): Promise<DocHandle<NotesDocument> | null> {
    const catalogDoc = catalog.doc();
    const docId = catalogDoc?.notesBucketDocIds?.[bucketKey];
    if (!docId) return null;
    return repo.find<NotesDocument>(docId as DocumentId);
  }

  async function getOrCreateBucketHandle(bucketKey: string): Promise<DocHandle<NotesDocument>> {
    const existing = await getBucketHandle(bucketKey);
    if (existing) return existing;

    const handle = repo.create<NotesDocument>();
    const template = createNotesDocument();
    handle.change((doc) => {
      doc.notes = template.notes;
    });

    catalog.change((doc) => {
      if (doc.notesBucketDocIds === undefined || doc.notesBucketDocIds === null) {
        doc.notesBucketDocIds = {};
      }
      doc.notesBucketDocIds[bucketKey] = handle.documentId;
    });

    return handle;
  }

  function appendNotesWithoutDuplicates(handle: DocHandle<NotesDocument>, notes: Note[]): void {
    handle.change((doc) => {
      const existingIds = new Set(doc.notes.map((note) => note.id));
      for (const note of notes) {
        if (!existingIds.has(note.id)) {
          doc.notes.push(toStorageNote(note));
          existingIds.add(note.id);
        }
      }
    });
  }

  async function migrateLegacyGlobalNotesDoc(): Promise<void> {
    const catalogDoc = catalog.doc();
    if (!catalogDoc?.notesDocId) return;

    const legacyHandle = await repo.find<NotesDocument>(catalogDoc.notesDocId as DocumentId);
    const legacyDoc = legacyHandle.doc();
    const notesToMigrate = legacyDoc?.notes.map(cloneNote) ?? [];

    if (notesToMigrate.length === 0) {
      catalog.change((doc) => {
        delete doc.notesDocId;
      });
      return;
    }

    const byBucket = new Map<string, Note[]>();
    for (const note of notesToMigrate) {
      const bucketKey = noteBucketKeyForNote(note);
      const bucketNotes = byBucket.get(bucketKey);
      if (bucketNotes) {
        bucketNotes.push(note);
      } else {
        byBucket.set(bucketKey, [note]);
      }
    }

    for (const [bucketKey, notes] of byBucket) {
      const bucketHandle = await getOrCreateBucketHandle(bucketKey);
      appendNotesWithoutDuplicates(bucketHandle, notes);
    }

    catalog.change((doc) => {
      if (doc.noteBucketByNoteId === undefined || doc.noteBucketByNoteId === null) {
        doc.noteBucketByNoteId = {};
      }

      delete doc.notesDocId;
    });

    // Remove migrated entries from legacy doc to avoid future duplicate migrations.
    legacyHandle.change((doc) => {
      doc.notes.splice(0, doc.notes.length);
    });

    emitDiagnostic("legacy-migration", {
      migratedNoteCount: notesToMigrate.length,
      targetBucketCount: byBucket.size,
    });
  }

  function clearLegacyNoteBucketIndex(): void {
    const catalogDoc = catalog.doc();
    const legacyEntryCount = Object.keys(catalogDoc?.noteBucketByNoteId ?? {}).length;
    if (legacyEntryCount === 0) return;

    catalog.change((doc) => {
      doc.noteBucketByNoteId = {};
    });

    emitDiagnostic("legacy-note-index-cleared", {
      legacyEntryCount,
    });
  }

  async function ensurePartitionModelReady(): Promise<void> {
    const catalogDoc = catalog.doc();
    if (!catalogDoc) return;

    if (
      catalogDoc.notesBucketDocIds === undefined ||
      catalogDoc.notesBucketDocIds === null ||
      catalogDoc.noteBucketByNoteId === undefined ||
      catalogDoc.noteBucketByNoteId === null
    ) {
      catalog.change((doc) => {
        if (doc.notesBucketDocIds === undefined || doc.notesBucketDocIds === null) {
          doc.notesBucketDocIds = {};
        }
        if (doc.noteBucketByNoteId === undefined || doc.noteBucketByNoteId === null) {
          doc.noteBucketByNoteId = {};
        }
      });
    }

    await migrateLegacyGlobalNotesDoc();
    clearLegacyNoteBucketIndex();
  }

  async function findNoteLocation(id: NoteId): Promise<NoteLocation | null> {
    const catalogDoc = catalog.doc();
    if (!catalogDoc) return null;

    for (const [bucketKey, docId] of Object.entries(catalogDoc.notesBucketDocIds ?? {})) {
      const handle = await repo.find<NotesDocument>(docId as DocumentId);
      const notesDoc = handle.doc();
      if (!notesDoc) continue;

      const index = notesDoc.notes.findIndex((n) => n.id === id);
      if (index === -1) continue;

      return { bucketKey, handle, index };
    }

    return null;
  }

  function listBucketKeys(filter?: NoteFilter): string[] {
    const catalogDoc = catalog.doc();
    if (!catalogDoc?.notesBucketDocIds) return [];

    const allBucketKeys = Object.keys(catalogDoc.notesBucketDocIds);

    if (!filter) return allBucketKeys;

    const exactEntityBucketKey = noteBucketKeyForFilter(filter);
    if (exactEntityBucketKey) {
      return catalogDoc.notesBucketDocIds[exactEntityBucketKey] ? [exactEntityBucketKey] : [];
    }

    if (filter.entityType) {
      const prefix = `entity:${filter.entityType}:`;
      return allBucketKeys.filter((bucketKey) => bucketKey.startsWith(prefix));
    }

    if (filter.journal) {
      return allBucketKeys.filter(
        (bucketKey) =>
          isJournalBucketKey(bucketKey) && journalBucketMatchesCreatedRange(bucketKey, filter),
      );
    }

    if (filter.createdFrom || filter.createdTo) {
      return allBucketKeys.filter((bucketKey) =>
        journalBucketMatchesCreatedRange(bucketKey, filter),
      );
    }

    return allBucketKeys;
  }

  /**
   * Verify that an entity exists (task or project).
   */
  async function entityExists(entityType: string, entityId: string): Promise<boolean> {
    const catalogDoc = catalog.doc();
    if (!catalogDoc) return false;

    if (entityType === "project") {
      return catalogDoc.projects.some((p) => p.id === entityId);
    }

    if (entityType === "task") {
      for (const docId of Object.values(catalogDoc.taskListDocIds)) {
        const handle = await repo.find<TaskListDocument>(docId as DocumentId);
        const doc = handle.doc();
        if (doc?.tasks.some((t) => t.id === entityId)) return true;
      }
      return false;
    }

    // Habits will be checked when that slice lands
    return true;
  }

  return {
    async create(input: CreateNoteInput): Promise<Result<Note>> {
      const validationErr = validateCreateNoteInput(input);
      if (validationErr) return err(validationErr);

      await ensurePartitionModelReady();

      // Verify entity exists if attached
      if (input.entityType && input.entityId) {
        const exists = await entityExists(input.entityType, input.entityId);
        if (!exists) {
          return err(notFound(input.entityType, input.entityId));
        }
      }

      const authorActorId = resolveAuthorActorId(input);
      if (authorActorId !== undefined && !actorExists(authorActorId)) {
        return err(notFound("actor", authorActorId));
      }

      const createdAt = input.createdAt
        ? new Date(input.createdAt).toISOString()
        : new Date().toISOString();
      const id = createNoteId(`note-${crypto.randomUUID().slice(0, 8)}`);

      const content = input.content.trim();
      const note: Note = {
        id,
        content,
        author: input.author ?? "user",
        tags: input.tags ?? [],
        createdAt,
        contentApproval: normalizeContentApproval(content, input.contentApproval),
      };
      if (authorActorId !== undefined) note.authorActorId = authorActorId;
      if (input.entityType !== undefined) note.entityType = input.entityType;
      if (input.entityId !== undefined) note.entityId = input.entityId;

      const bucketKey = noteBucketKeyForNote(note);
      const notesHandle = await getOrCreateBucketHandle(bucketKey);
      appendNotesWithoutDuplicates(notesHandle, [note]);

      emitDiagnostic("create", {
        noteId: id,
        bucketKey,
      });

      return ok(note);
    },

    async list(filter?: NoteFilter): Promise<Result<Note[]>> {
      const validationErr = filter ? validateNoteFilter(filter) : null;
      if (validationErr) return err(validationErr);

      await ensurePartitionModelReady();

      const normalizedFilter = normalizeNoteFilter(filter);
      const bucketKeys = listBucketKeys(normalizedFilter);
      if (bucketKeys.length === 0) return ok([]);

      const allNotes: Note[] = [];

      for (const bucketKey of bucketKeys) {
        const bucketHandle = await getBucketHandle(bucketKey);
        const bucketDoc = bucketHandle?.doc();
        if (!bucketDoc) continue;

        allNotes.push(...bucketDoc.notes.map(cloneNote));
      }

      let notes = allNotes;

      // Apply filters
      if (normalizedFilter?.entityType) {
        notes = notes.filter((n) => n.entityType === normalizedFilter.entityType);
      }
      if (normalizedFilter?.entityId) {
        notes = notes.filter((n) => n.entityId === normalizedFilter.entityId);
      }
      if (normalizedFilter?.tag) {
        const tag = normalizedFilter.tag;
        notes = notes.filter((n) => n.tags.includes(tag));
      }
      if (normalizedFilter?.author) {
        const author = normalizedFilter.author;
        notes = notes.filter((n) => n.author === author);
      }
      if (normalizedFilter?.authorActorId) {
        const authorActorId = normalizedFilter.authorActorId;
        notes = notes.filter((n) => n.authorActorId === authorActorId);
      }
      if (normalizedFilter?.journal) {
        notes = notes.filter((n) => n.entityType === undefined && n.entityId === undefined);
      }
      if (normalizedFilter?.createdFrom) {
        notes = notes.filter((n) => n.createdAt >= normalizedFilter.createdFrom!);
      }
      if (normalizedFilter?.createdTo) {
        notes = notes.filter((n) => n.createdAt <= normalizedFilter.createdTo!);
      }

      // Sort by createdAt desc (newest first)
      notes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      emitDiagnostic("list", {
        bucketCount: bucketKeys.length,
        resultCount: notes.length,
        entityType: normalizedFilter?.entityType,
        hasEntityId: normalizedFilter?.entityId !== undefined,
        journal: normalizedFilter?.journal === true,
      });

      return ok(notes);
    },

    async get(id: NoteId): Promise<Result<Note>> {
      await ensurePartitionModelReady();

      const location = await findNoteLocation(id);
      if (!location) return err(notFound("note", id));

      const note = location.handle.doc()?.notes[location.index];
      if (!note) return err(notFound("note", id));

      return ok(cloneNote(note));
    },

    async update(id: NoteId, input: UpdateNoteInput): Promise<Result<Note>> {
      const validationErr = validateUpdateNoteInput(input);
      if (validationErr) return err(validationErr);

      await ensurePartitionModelReady();

      const location = await findNoteLocation(id);
      if (!location) return err(notFound("note", id));

      if (input.authorActorId !== undefined && !actorExists(input.authorActorId)) {
        return err(notFound("actor", input.authorActorId));
      }

      location.handle.change((doc) => {
        const note = doc.notes[location.index];
        if (input.content !== undefined) {
          note.content = input.content.trim();
          note.contentApproval = normalizeContentApproval(note.content, input.contentApproval);
        } else if (input.contentApproval !== undefined) {
          note.contentApproval = normalizeContentApproval(note.content, input.contentApproval);
        }
        if (input.authorActorId !== undefined) note.authorActorId = input.authorActorId;
        if (input.tags !== undefined) {
          // Clear and repopulate tags array for Automerge compatibility
          while (note.tags.length > 0) note.tags.pop();
          for (const tag of input.tags) note.tags.push(tag);
        }
      });

      const updated = location.handle.doc()?.notes[location.index];
      if (!updated) return err(notFound("note", id));

      emitDiagnostic("update", {
        noteId: id,
        bucketKey: location.bucketKey,
      });

      return ok(cloneNote(updated));
    },

    async delete(id: NoteId): Promise<Result<void>> {
      await ensurePartitionModelReady();

      const location = await findNoteLocation(id);
      if (!location) return err(notFound("note", id));

      location.handle.change((doc) => {
        doc.notes.splice(location.index, 1);
      });

      const bucketIsEmpty = (location.handle.doc()?.notes.length ?? 0) === 0;

      catalog.change((doc) => {
        if (
          bucketIsEmpty &&
          doc.notesBucketDocIds !== undefined &&
          doc.notesBucketDocIds !== null
        ) {
          delete doc.notesBucketDocIds[location.bucketKey];
        }
      });

      emitDiagnostic("delete", {
        noteId: id,
        bucketKey: location.bucketKey,
        bucketDeleted: bucketIsEmpty,
      });

      return ok(undefined);
    },
  };
}

function toStorageNote(n: Note): Note {
  const note: Note = {
    id: n.id,
    content: n.content,
    author: n.author,
    tags: [...n.tags],
    createdAt: n.createdAt,
    contentApproval: normalizeStoredNoteContentApproval(n.content, n.contentApproval),
  };

  if (n.authorActorId !== undefined) note.authorActorId = n.authorActorId;
  if (n.entityType !== undefined) note.entityType = n.entityType;
  if (n.entityId !== undefined) note.entityId = n.entityId;

  return note;
}

function cloneNote(n: Note): Note {
  return toStorageNote(n);
}
