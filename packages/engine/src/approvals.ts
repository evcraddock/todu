import type { DocHandle } from "@automerge/automerge-repo/slim";
import {
  type ActorId,
  type ApprovalItem,
  type ApprovalListFilter,
  type CatalogDocument,
  err,
  type Note,
  type NoteId,
  notFound,
  ok,
  type Result,
  type TaskId,
  type TaskWithDetail,
  validationError,
} from "@todu/core";
import type { ApprovalNamespace, NoteNamespace, TaskNamespace } from "./todu.js";

const APPROVAL_PREVIEW_LENGTH = 80;

function createContentPreview(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= APPROVAL_PREVIEW_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, APPROVAL_PREVIEW_LENGTH - 3)}...`;
}

export function createApprovalNamespace(
  catalog: DocHandle<CatalogDocument>,
  taskNamespace: TaskNamespace,
  noteNamespace: NoteNamespace,
): ApprovalNamespace {
  function getReviewedByActorId(): ActorId | undefined {
    return catalog.doc()?.ownerActorId;
  }

  function buildTaskApprovalItem(task: TaskWithDetail): ApprovalItem {
    return {
      kind: "taskDescription",
      state: task.descriptionApproval?.state ?? "notRequired",
      taskId: task.id,
      projectId: task.projectId,
      taskTitle: task.title,
      contentPreview: createContentPreview(task.description ?? ""),
      sourceBindingId: task.descriptionApproval?.sourceBindingId,
      sourceActorId: task.descriptionApproval?.sourceActorId,
      sourceFingerprint: task.descriptionApproval?.sourceFingerprint,
      reviewedAt: task.descriptionApproval?.reviewedAt,
      reviewedByActorId: task.descriptionApproval?.reviewedByActorId,
    };
  }

  function buildNoteApprovalItem(note: Note): ApprovalItem {
    return {
      kind: "noteContent",
      state: note.contentApproval?.state ?? "notRequired",
      noteId: note.id,
      entityType: note.entityType,
      entityId: note.entityId,
      contentPreview: createContentPreview(note.content),
      sourceBindingId: note.contentApproval?.sourceBindingId,
      sourceActorId: note.contentApproval?.sourceActorId,
      sourceFingerprint: note.contentApproval?.sourceFingerprint,
      reviewedAt: note.contentApproval?.reviewedAt,
      reviewedByActorId: note.contentApproval?.reviewedByActorId,
    };
  }

  return {
    async list(filter?: ApprovalListFilter): Promise<Result<ApprovalItem[]>> {
      const items: ApprovalItem[] = [];

      if (filter?.kind !== "noteContent") {
        const tasks = await taskNamespace.list();
        if (!tasks.ok) return tasks;

        for (const task of tasks.value) {
          const detail = await taskNamespace.get(task.id);
          if (!detail.ok) return detail;

          if (
            detail.value.descriptionApproval?.state === "pendingApproval" &&
            detail.value.description
          ) {
            items.push(buildTaskApprovalItem(detail.value));
          }
        }
      }

      if (filter?.kind !== "taskDescription") {
        const notes = await noteNamespace.list();
        if (!notes.ok) return notes;

        for (const note of notes.value) {
          if (note.contentApproval?.state === "pendingApproval") {
            items.push(buildNoteApprovalItem(note));
          }
        }
      }

      return ok(items);
    },

    async approveTaskDescription(taskId: TaskId): Promise<Result<ApprovalItem>> {
      const task = await taskNamespace.get(taskId);
      if (!task.ok) return task;

      if (!task.value.description) {
        return err(validationError("taskId", `Task has no description to approve: ${taskId}`));
      }

      const approval = task.value.descriptionApproval;
      if (!approval || approval.state === "notRequired") {
        return err(
          validationError("taskId", `Task description does not require approval: ${taskId}`),
        );
      }
      if (approval.state === "approved") {
        return err(validationError("taskId", `Task description is already approved: ${taskId}`));
      }

      const reviewedByActorId = getReviewedByActorId();
      const updated = await taskNamespace.update(taskId, {
        descriptionApproval: {
          ...approval,
          state: "approved",
          reviewedAt: new Date().toISOString(),
          ...(reviewedByActorId !== undefined ? { reviewedByActorId } : {}),
        },
      });
      if (!updated.ok) return updated;

      return ok(buildTaskApprovalItem(updated.value));
    },

    async approveNoteContent(noteId: NoteId): Promise<Result<ApprovalItem>> {
      const notes = await noteNamespace.list();
      if (!notes.ok) return notes;

      const note = notes.value.find((candidate) => candidate.id === noteId);
      if (!note) {
        return err(notFound("note", noteId));
      }

      const approval = note.contentApproval;
      if (!approval || approval.state === "notRequired") {
        return err(validationError("noteId", `Note content does not require approval: ${noteId}`));
      }
      if (approval.state === "approved") {
        return err(validationError("noteId", `Note content is already approved: ${noteId}`));
      }

      const reviewedByActorId = getReviewedByActorId();
      const updated = await noteNamespace.update(noteId, {
        contentApproval: {
          ...approval,
          state: "approved",
          reviewedAt: new Date().toISOString(),
          ...(reviewedByActorId !== undefined ? { reviewedByActorId } : {}),
        },
      });
      if (!updated.ok) return updated;

      return ok(buildNoteApprovalItem(updated.value));
    },
  };
}
