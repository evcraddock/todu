import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ProjectId } from "@todu/core";
import { createNoteId } from "@todu/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTodu } from "./index.js";
import type { Todu } from "./index.js";

describe("note namespace", () => {
  let tmpDir: string;
  let todu: Todu;
  let projectId: ProjectId;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-note-test-"));
    todu = await createTodu({ storagePath: tmpDir });

    const project = await todu.project.create({ name: "Test Project" });
    if (!project.ok) throw new Error("create failed");
    projectId = project.value.id;
  });

  afterEach(async () => {
    await todu.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("create", () => {
    it("creates a standalone note (journal entry)", async () => {
      const result = await todu.note.create({ content: "Today was productive" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.content).toBe("Today was productive");
      expect(result.value.author).toBe("user");
      expect(result.value.entityType).toBeUndefined();
      expect(result.value.entityId).toBeUndefined();
      expect(result.value.tags).toEqual([]);
      expect(result.value.id).toMatch(/^note-/);
    });

    it("creates a note attached to a task", async () => {
      const task = await todu.task.create({ title: "Test", projectId });
      if (!task.ok) throw new Error("create failed");

      const result = await todu.note.create({
        content: "Making progress",
        entityType: "task",
        entityId: task.value.id,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.entityType).toBe("task");
      expect(result.value.entityId).toBe(task.value.id);
    });

    it("creates a note attached to a project", async () => {
      const result = await todu.note.create({
        content: "Project kickoff",
        entityType: "project",
        entityId: projectId,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.entityType).toBe("project");
      expect(result.value.entityId).toBe(projectId);
    });

    it("creates a note with tags", async () => {
      const result = await todu.note.create({
        content: "Design idea",
        tags: ["idea", "design"],
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.tags).toEqual(["idea", "design"]);
    });

    it("creates a note with custom author", async () => {
      const result = await todu.note.create({
        content: "Agent note",
        author: "agent",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.author).toBe("agent");
    });

    it("rejects empty content", async () => {
      const result = await todu.note.create({ content: "" });
      expect(result.ok).toBe(false);
    });

    it("rejects note attached to nonexistent task", async () => {
      const result = await todu.note.create({
        content: "Note",
        entityType: "task",
        entityId: "task-nonexistent",
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("not-found");
    });

    it("rejects note attached to nonexistent project", async () => {
      const result = await todu.note.create({
        content: "Note",
        entityType: "project",
        entityId: "proj-nonexistent",
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("not-found");
    });
  });

  describe("list", () => {
    it("returns empty list when no notes exist", async () => {
      const result = await todu.note.list();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual([]);
    });

    it("returns all notes sorted newest first", async () => {
      await todu.note.create({ content: "First" });
      await todu.note.create({ content: "Second" });

      const result = await todu.note.list();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(2);
      expect(result.value[0].content).toBe("Second");
      expect(result.value[1].content).toBe("First");
    });

    it("filters by entityType", async () => {
      const task = await todu.task.create({ title: "Test", projectId });
      if (!task.ok) throw new Error("create failed");

      await todu.note.create({ content: "Journal entry" });
      await todu.note.create({
        content: "Task note",
        entityType: "task",
        entityId: task.value.id,
      });

      const result = await todu.note.list({ entityType: "task" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(1);
      expect(result.value[0].content).toBe("Task note");
    });

    it("filters by entityId", async () => {
      const task1 = await todu.task.create({ title: "Task 1", projectId });
      const task2 = await todu.task.create({ title: "Task 2", projectId });
      if (!task1.ok || !task2.ok) throw new Error("create failed");

      await todu.note.create({
        content: "Note on task 1",
        entityType: "task",
        entityId: task1.value.id,
      });
      await todu.note.create({
        content: "Note on task 2",
        entityType: "task",
        entityId: task2.value.id,
      });

      const result = await todu.note.list({ entityId: task1.value.id });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(1);
      expect(result.value[0].content).toBe("Note on task 1");
    });

    it("filters by tag", async () => {
      await todu.note.create({ content: "Idea", tags: ["idea"] });
      await todu.note.create({ content: "Not tagged" });

      const result = await todu.note.list({ tag: "idea" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(1);
      expect(result.value[0].content).toBe("Idea");
    });

    it("filters by author", async () => {
      await todu.note.create({ content: "User note" });
      await todu.note.create({ content: "Agent note", author: "agent" });

      const result = await todu.note.list({ author: "agent" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(1);
      expect(result.value[0].content).toBe("Agent note");
    });
  });

  describe("delete", () => {
    it("deletes a note", async () => {
      const created = await todu.note.create({ content: "To delete" });
      if (!created.ok) throw new Error("create failed");

      const result = await todu.note.delete(created.value.id);
      expect(result.ok).toBe(true);

      const list = await todu.note.list();
      expect(list.ok).toBe(true);
      if (!list.ok) return;
      expect(list.value).toHaveLength(0);
    });

    it("returns NotFound for nonexistent note", async () => {
      const result = await todu.note.delete(createNoteId("note-nope"));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("not-found");
    });
  });

  describe("persistence", () => {
    it("notes survive close and reopen", async () => {
      await todu.note.create({ content: "Persistent thought", tags: ["journal"] });
      await todu.close();

      todu = await createTodu({ storagePath: tmpDir });
      const result = await todu.note.list();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(1);
      expect(result.value[0].content).toBe("Persistent thought");
      expect(result.value[0].tags).toEqual(["journal"]);
    });
  });
});
