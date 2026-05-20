import crypto from "node:crypto";
import type { DocHandle, DocumentId, Repo } from "@automerge/automerge-repo/slim";
import {
  type Actor,
  type ActorId,
  type CatalogDocument,
  type CommentSyncProvenance,
  type CommentSyncProvenanceDocument,
  type CommentSyncProvenanceFilter,
  createCommentSyncProvenanceDocument,
  createCommentSyncProvenanceId,
  type NoteId,
  ok,
  type Result,
  type UpsertCommentSyncProvenanceInput,
  validationError,
} from "@todu/core";
import type { SyncRuntimeActorTools, SyncRuntimeCommentProvenanceTools } from "./todu.js";

function cloneActor(actor: Actor): Actor {
  return {
    id: actor.id,
    displayName: actor.displayName,
    ...(actor.archived !== undefined ? { archived: actor.archived } : {}),
  };
}

function cloneCommentSyncProvenance(record: CommentSyncProvenance): CommentSyncProvenance {
  return {
    id: record.id,
    bindingId: record.bindingId,
    provider: record.provider,
    targetKind: record.targetKind,
    targetRef: record.targetRef,
    localNoteId: record.localNoteId,
    externalTaskId: record.externalTaskId,
    externalCommentId: record.externalCommentId,
    ...(record.sourceUrl !== undefined ? { sourceUrl: record.sourceUrl } : {}),
    lastMirroredAt: record.lastMirroredAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function createStableCommentSyncProvenanceId(
  input: Pick<UpsertCommentSyncProvenanceInput, "bindingId" | "localNoteId">,
): ReturnType<typeof createCommentSyncProvenanceId> {
  const hash = crypto
    .createHash("sha1")
    .update(`${input.bindingId}:${input.localNoteId}`)
    .digest("hex")
    .slice(0, 16);
  return createCommentSyncProvenanceId(`cprov-${hash}`);
}

function matchesCommentSyncProvenanceFilter(
  record: CommentSyncProvenance,
  filter?: CommentSyncProvenanceFilter,
): boolean {
  if (!filter) return true;
  if (filter.bindingId !== undefined && record.bindingId !== filter.bindingId) return false;
  if (filter.localNoteId !== undefined && record.localNoteId !== filter.localNoteId) return false;
  if (filter.externalTaskId !== undefined && record.externalTaskId !== filter.externalTaskId) {
    return false;
  }
  if (
    filter.externalCommentId !== undefined &&
    record.externalCommentId !== filter.externalCommentId
  ) {
    return false;
  }
  return true;
}

async function getOrCreateCommentSyncProvenanceHandle(
  catalog: DocHandle<CatalogDocument>,
  repo: Repo,
): Promise<DocHandle<CommentSyncProvenanceDocument>> {
  const existingDocId = catalog.doc()?.commentSyncProvenanceDocId;
  if (existingDocId) {
    const handle = await repo.find<CommentSyncProvenanceDocument>(existingDocId as DocumentId);
    await handle.whenReady();
    return handle;
  }

  const handle = repo.create<CommentSyncProvenanceDocument>();
  const empty = createCommentSyncProvenanceDocument();
  handle.change((doc) => {
    doc.records = empty.records;
  });

  catalog.change((doc) => {
    doc.commentSyncProvenanceDocId = handle.documentId;
  });

  return handle;
}

async function getCommentSyncProvenanceHandle(
  catalog: DocHandle<CatalogDocument>,
  repo: Repo,
): Promise<DocHandle<CommentSyncProvenanceDocument> | null> {
  const docId = catalog.doc()?.commentSyncProvenanceDocId;
  if (!docId) return null;
  const handle = await repo.find<CommentSyncProvenanceDocument>(docId as DocumentId);
  await handle.whenReady();
  return handle;
}

export function createSyncRuntimeCommentProvenanceTools(
  catalog: DocHandle<CatalogDocument>,
  repo: Repo,
): SyncRuntimeCommentProvenanceTools {
  return {
    async list(filter?: CommentSyncProvenanceFilter): Promise<Result<CommentSyncProvenance[]>> {
      const handle = await getCommentSyncProvenanceHandle(catalog, repo);
      const records = handle?.doc()?.records ?? [];
      return ok(
        records
          .filter((record) => matchesCommentSyncProvenanceFilter(record, filter))
          .map(cloneCommentSyncProvenance),
      );
    },

    async upsert(input: UpsertCommentSyncProvenanceInput): Promise<Result<CommentSyncProvenance>> {
      const handle = await getOrCreateCommentSyncProvenanceHandle(catalog, repo);
      const now = new Date().toISOString();
      const existing = handle
        .doc()
        ?.records.find(
          (record) =>
            record.bindingId === input.bindingId && record.localNoteId === input.localNoteId,
        );

      if (existing && existing.externalCommentId !== input.externalCommentId) {
        return {
          ok: false,
          error: validationError(
            "externalCommentId",
            `comment provenance conflict: note=${input.localNoteId} existing=${existing.externalCommentId} next=${input.externalCommentId}`,
          ),
        };
      }

      const existingByExternalCommentId = handle
        .doc()
        ?.records.find(
          (record) =>
            record.bindingId === input.bindingId &&
            record.externalCommentId === input.externalCommentId &&
            record.localNoteId !== input.localNoteId,
        );
      if (existingByExternalCommentId) {
        return {
          ok: false,
          error: validationError(
            "externalCommentId",
            `comment provenance conflict: externalCommentId=${input.externalCommentId} existingNote=${existingByExternalCommentId.localNoteId} nextNote=${input.localNoteId}`,
          ),
        };
      }

      const recordId = existing?.id ?? createStableCommentSyncProvenanceId(input);
      handle.change((doc) => {
        const index = doc.records.findIndex(
          (record) =>
            record.bindingId === input.bindingId && record.localNoteId === input.localNoteId,
        );
        const next: CommentSyncProvenance = {
          id: recordId,
          bindingId: input.bindingId,
          provider: input.provider,
          targetKind: input.targetKind,
          targetRef: input.targetRef,
          localNoteId: input.localNoteId,
          externalTaskId: input.externalTaskId,
          externalCommentId: input.externalCommentId,
          ...(input.sourceUrl !== undefined ? { sourceUrl: input.sourceUrl } : {}),
          lastMirroredAt: input.lastMirroredAt,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        };

        if (index === -1) {
          doc.records.push(next);
        } else {
          doc.records[index] = next;
        }
      });

      const stored = handle
        .doc()
        ?.records.find(
          (record) =>
            record.bindingId === input.bindingId && record.localNoteId === input.localNoteId,
        );
      return ok(
        cloneCommentSyncProvenance(
          stored ?? {
            id: recordId,
            bindingId: input.bindingId,
            provider: input.provider,
            targetKind: input.targetKind,
            targetRef: input.targetRef,
            localNoteId: input.localNoteId,
            externalTaskId: input.externalTaskId,
            externalCommentId: input.externalCommentId,
            ...(input.sourceUrl !== undefined ? { sourceUrl: input.sourceUrl } : {}),
            lastMirroredAt: input.lastMirroredAt,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
          },
        ),
      );
    },

    async deleteForNote(noteId: NoteId): Promise<Result<void>> {
      const handle = await getCommentSyncProvenanceHandle(catalog, repo);
      if (!handle) return ok(undefined);

      handle.change((doc) => {
        for (let index = doc.records.length - 1; index >= 0; index -= 1) {
          if (doc.records[index].localNoteId === noteId) {
            doc.records.splice(index, 1);
          }
        }
      });

      return ok(undefined);
    },
  };
}

export function createSyncRuntimeActorTools(
  catalog: DocHandle<CatalogDocument>,
): SyncRuntimeActorTools {
  return {
    async list(): Promise<Result<Actor[]>> {
      return ok((catalog.doc()?.actors ?? []).map(cloneActor));
    },

    async getOwnerActorId(): Promise<Result<ActorId | undefined>> {
      return ok(catalog.doc()?.ownerActorId);
    },

    async ensure(input: { id: ActorId; displayName: string }): Promise<Result<Actor>> {
      const normalizedDisplayName = input.displayName.trim() || String(input.id);
      const existing = catalog.doc()?.actors.find((actor) => actor.id === input.id);
      if (existing) {
        return ok(cloneActor(existing));
      }

      const nextActor: Actor = {
        id: input.id,
        displayName: normalizedDisplayName,
      };

      catalog.change((doc) => {
        const alreadyPresent = doc.actors.some((actor) => actor.id === input.id);
        if (!alreadyPresent) {
          doc.actors.push(nextActor);
        }
      });

      const created = catalog.doc()?.actors.find((actor) => actor.id === input.id) ?? nextActor;
      return ok(cloneActor(created));
    },
  };
}
