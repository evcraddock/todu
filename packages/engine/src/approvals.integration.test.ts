import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createActorId, createIntegrationBindingId, createNoteId, createTaskId } from "@todu/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Todu } from "./index.js";
import { createTodu } from "./index.js";

describe("approval namespace", () => {
  let tmpDir: string;
  let todu: Todu;
  let taskId: ReturnType<typeof createTaskId>;
  let noteId: ReturnType<typeof createNoteId>;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-approval-test-"));
    todu = await createTodu({ storagePath: tmpDir });

    const project = await todu.project.create({ name: "Approval Project" });
    if (!project.ok) throw new Error("project create failed");

    const task = await todu.task.create({
      title: "Imported task",
      projectId: project.value.id,
      description: "Imported instructions",
      descriptionApproval: {
        state: "pendingApproval",
        sourceBindingId: createIntegrationBindingId("ibind-test"),
        sourceActorId: createActorId("actor-user"),
      },
    });
    if (!task.ok) throw new Error("task create failed");
    taskId = task.value.id;

    const note = await todu.note.create({
      content: "Imported comment",
      entityType: "task",
      entityId: taskId,
      contentApproval: {
        state: "pendingApproval",
        sourceBindingId: createIntegrationBindingId("ibind-test"),
        sourceActorId: createActorId("actor-user"),
      },
    });
    if (!note.ok) throw new Error("note create failed");
    noteId = note.value.id;

    const localNote = await todu.note.create({ content: "Local note" });
    if (!localNote.ok) throw new Error("local note create failed");
  });

  afterEach(async () => {
    await todu.close();
    await new Promise((resolve) => setTimeout(resolve, 50));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("lists pending approval items and filters by kind", async () => {
    const all = await todu.approval.list();
    expect(all.ok).toBe(true);
    if (!all.ok) return;

    expect(all.value).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "taskDescription", taskId, state: "pendingApproval" }),
        expect.objectContaining({ kind: "noteContent", noteId, state: "pendingApproval" }),
      ]),
    );

    const tasksOnly = await todu.approval.list({ kind: "taskDescription" });
    expect(tasksOnly.ok).toBe(true);
    if (!tasksOnly.ok) return;
    expect(tasksOnly.value).toHaveLength(1);
    expect(tasksOnly.value[0]).toMatchObject({ kind: "taskDescription", taskId });

    const notesOnly = await todu.approval.list({ kind: "noteContent" });
    expect(notesOnly.ok).toBe(true);
    if (!notesOnly.ok) return;
    expect(notesOnly.value).toHaveLength(1);
    expect(notesOnly.value[0]).toMatchObject({ kind: "noteContent", noteId });
  });

  it("approves pending task descriptions explicitly", async () => {
    const result = await todu.approval.approveTaskDescription(taskId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toMatchObject({
      kind: "taskDescription",
      taskId,
      state: "approved",
      reviewedByActorId: "actor-user",
    });
    expect(result.value.reviewedAt).toEqual(expect.any(String));

    const task = await todu.task.get(taskId);
    expect(task.ok).toBe(true);
    if (!task.ok) return;
    expect(task.value.descriptionApproval).toMatchObject({
      state: "approved",
      reviewedByActorId: "actor-user",
    });
  });

  it("approves pending note content explicitly", async () => {
    const result = await todu.approval.approveNoteContent(noteId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toMatchObject({
      kind: "noteContent",
      noteId,
      state: "approved",
      reviewedByActorId: "actor-user",
    });
    expect(result.value.reviewedAt).toEqual(expect.any(String));

    const notes = await todu.note.list({ entityType: "task", entityId: taskId });
    expect(notes.ok).toBe(true);
    if (!notes.ok) return;
    expect(notes.value[0].contentApproval).toMatchObject({
      state: "approved",
      reviewedByActorId: "actor-user",
    });
  });

  it("rejects invalid approval actions with clear errors", async () => {
    const localProject = await todu.project.create({ name: "Local" });
    if (!localProject.ok) throw new Error("local project create failed");
    const localTask = await todu.task.create({
      title: "Local task",
      projectId: localProject.value.id,
      description: "Local only",
    });
    if (!localTask.ok) throw new Error("local task create failed");

    const notRequired = await todu.approval.approveTaskDescription(localTask.value.id);
    expect(notRequired.ok).toBe(false);
    if (notRequired.ok) return;
    expect(notRequired.error.type).toBe("validation");
    expect(notRequired.error.message).toContain("does not require approval");

    const firstApproval = await todu.approval.approveNoteContent(noteId);
    if (!firstApproval.ok) throw new Error("note approval failed");
    const alreadyApproved = await todu.approval.approveNoteContent(noteId);
    expect(alreadyApproved.ok).toBe(false);
    if (alreadyApproved.ok) return;
    expect(alreadyApproved.error.type).toBe("validation");
    expect(alreadyApproved.error.message).toContain("already approved");

    const missingTask = await todu.approval.approveTaskDescription(createTaskId("task-missing"));
    expect(missingTask.ok).toBe(false);
    if (missingTask.ok) return;
    expect(missingTask.error.type).toBe("not-found");

    const missingNote = await todu.approval.approveNoteContent(createNoteId("note-missing"));
    expect(missingNote.ok).toBe(false);
    if (missingNote.ok) return;
    expect(missingNote.error.type).toBe("not-found");
  });
});
