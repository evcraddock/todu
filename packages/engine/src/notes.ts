import crypto from "node:crypto";
import type { DocHandle, DocumentId } from "@automerge/automerge-repo";
import type { Repo } from "@automerge/automerge-repo";
import {
  type CatalogDocument,
  type CreateNoteInput,
  type Note,
  type NoteFilter,
  type NoteId,
  type NotesDocument,
  type Result,
  type TaskListDocument,
  createNoteId,
  createNotesDocument,
  err,
  notFound,
  ok,
  validateCreateNoteInput,
} from "@todu/core";
import type { NoteNamespace } from "./todu.js";

// ============================================================================
// Note namespace — CRUD on NotesDocument
// ============================================================================

export function createNoteNamespace(
  catalog: DocHandle<CatalogDocument>,
  repo: Repo,
): NoteNamespace {
  /**
   * Get or create the global NotesDocument.
   */
  async function getOrCreateNotesDoc(): Promise<DocHandle<NotesDocument>> {
    const catalogDoc = catalog.doc();
    const existingDocId = catalogDoc?.notesDocId;

    if (existingDocId) {
      return await repo.find<NotesDocument>(existingDocId as DocumentId);
    }

    const handle = repo.create<NotesDocument>();
    const template = createNotesDocument();
    handle.change((doc) => {
      doc.notes = template.notes;
    });

    catalog.change((doc) => {
      doc.notesDocId = handle.documentId;
    });

    return handle;
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

      // Verify entity exists if attached
      if (input.entityType && input.entityId) {
        const exists = await entityExists(input.entityType, input.entityId);
        if (!exists) {
          return err(notFound(input.entityType, input.entityId));
        }
      }

      const now = new Date().toISOString();
      const id = createNoteId(`note-${crypto.randomUUID().slice(0, 8)}`);

      const note: Note = {
        id,
        content: input.content.trim(),
        author: input.author ?? "user",
        tags: input.tags ?? [],
        createdAt: now,
      };
      if (input.entityType !== undefined) note.entityType = input.entityType;
      if (input.entityId !== undefined) note.entityId = input.entityId;

      const notesHandle = await getOrCreateNotesDoc();
      notesHandle.change((doc) => {
        doc.notes.push(note);
      });

      return ok(note);
    },

    async list(filter?: NoteFilter): Promise<Result<Note[]>> {
      const catalogDoc = catalog.doc();
      if (!catalogDoc?.notesDocId) return ok([]);

      const notesHandle = await repo.find<NotesDocument>(catalogDoc.notesDocId as DocumentId);
      const notesDoc = notesHandle.doc();
      if (!notesDoc) return ok([]);

      let notes = notesDoc.notes.map(cloneNote);

      // Apply filters
      if (filter?.entityType) {
        notes = notes.filter((n) => n.entityType === filter.entityType);
      }
      if (filter?.entityId) {
        notes = notes.filter((n) => n.entityId === filter.entityId);
      }
      if (filter?.tag) {
        notes = notes.filter((n) => n.tags.includes(filter.tag!));
      }
      if (filter?.author) {
        notes = notes.filter((n) => n.author === filter.author);
      }

      // Sort by createdAt desc (newest first)
      notes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      return ok(notes);
    },

    async delete(id: NoteId): Promise<Result<void>> {
      const catalogDoc = catalog.doc();
      if (!catalogDoc?.notesDocId) return err(notFound("note", id));

      const notesHandle = await repo.find<NotesDocument>(catalogDoc.notesDocId as DocumentId);
      const notesDoc = notesHandle.doc();
      if (!notesDoc) return err(notFound("note", id));

      const index = notesDoc.notes.findIndex((n) => n.id === id);
      if (index === -1) return err(notFound("note", id));

      notesHandle.change((doc) => {
        doc.notes.splice(index, 1);
      });

      return ok(undefined);
    },
  };
}

function cloneNote(n: Note): Note {
  return {
    id: n.id,
    content: n.content,
    author: n.author,
    entityType: n.entityType,
    entityId: n.entityId,
    tags: [...n.tags],
    createdAt: n.createdAt,
  };
}
