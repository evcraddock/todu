import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DocumentId } from "@automerge/automerge-repo";
import { Repo } from "@automerge/automerge-repo";
import { NodeFSStorageAdapter } from "@automerge/automerge-repo-storage-nodefs";
import {
  type CatalogDocument,
  createEmptyCatalog,
  createNoteId,
  createNotesDocument,
  type Note,
  type ProjectId,
} from "@todu/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Todu } from "./index.js";
import { createTodu } from "./index.js";

async function readCatalogDocument(storagePath: string): Promise<CatalogDocument> {
  const markerPath = path.join(storagePath, "todu-catalog.id");
  const catalogId = fs.readFileSync(markerPath, "utf-8").trim() as DocumentId;

  const repo = new Repo({
    storage: new NodeFSStorageAdapter(storagePath),
  });

  try {
    const catalog = await repo.find<CatalogDocument>(catalogId);
    const doc = catalog.doc();
    if (!doc) throw new Error("catalog document not available");

    return JSON.parse(JSON.stringify(doc)) as CatalogDocument;
  } finally {
    await repo.shutdown();
  }
}

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
    await new Promise((r) => setTimeout(r, 50));
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

    it("creates a journal note with an explicit historical timestamp", async () => {
      const result = await todu.note.create({
        content: "Imported from old journal",
        createdAt: "2021-04-17T14:30:00Z",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.createdAt).toBe("2021-04-17T14:30:00.000Z");
    });

    it("rejects invalid createdAt input", async () => {
      const result = await todu.note.create({
        content: "Imported from old journal",
        createdAt: "not-a-date",
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("validation");
      expect(result.error.field).toBe("createdAt");
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

    it("filters by created-at date range and composes with tag filters", async () => {
      await todu.note.create({
        content: "February journal",
        tags: ["journal"],
        createdAt: "2026-02-20T12:00:00Z",
      });
      await todu.note.create({
        content: "March journal",
        tags: ["journal"],
        createdAt: "2026-03-12T08:30:00Z",
      });
      await todu.note.create({
        content: "March work log",
        tags: ["work"],
        createdAt: "2026-03-18T18:45:00Z",
      });
      await todu.note.create({
        content: "April journal",
        tags: ["journal"],
        createdAt: "2026-04-01T09:00:00Z",
      });

      const result = await todu.note.list({
        tag: "journal",
        createdFrom: "2026-03-01",
        createdTo: "2026-03-31",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.map((note) => note.content)).toEqual(["March journal"]);
    });

    it("rejects invalid date range filters", async () => {
      const result = await todu.note.list({ createdFrom: "not-a-date" });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("validation");
      if (result.error.type !== "validation") return;
      expect(result.error.field).toBe("createdFrom");
    });

    it("lists only standalone journal notes when requested", async () => {
      const task = await todu.task.create({ title: "Task note", projectId });
      if (!task.ok) throw new Error("create failed");

      await todu.note.create({ content: "Journal entry" });
      await todu.note.create({
        content: "Task attached",
        entityType: "task",
        entityId: task.value.id,
      });

      const result = await todu.note.list({ journal: true });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.map((note) => note.content)).toEqual(["Journal entry"]);
    });

    it("narrows journal bucket reads for journal-only date range queries", async () => {
      const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
      const previousDiagnostics = process.env.TODU_NOTES_DIAGNOSTICS;
      process.env.TODU_NOTES_DIAGNOSTICS = "1";

      try {
        const task = await todu.task.create({ title: "Task note", projectId });
        if (!task.ok) throw new Error("create failed");

        await todu.note.create({ content: "January journal", createdAt: "2026-01-15T12:00:00Z" });
        await todu.note.create({ content: "March journal", createdAt: "2026-03-15T12:00:00Z" });
        await todu.note.create({ content: "April journal", createdAt: "2026-04-15T12:00:00Z" });
        await todu.note.create({
          content: "March task note",
          entityType: "task",
          entityId: task.value.id,
          createdAt: "2026-03-20T09:00:00Z",
        });

        const result = await todu.note.list({
          journal: true,
          createdFrom: "2026-03-01",
          createdTo: "2026-03-31",
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.map((note) => note.content)).toEqual(["March journal"]);

        const listDiagnostic = infoSpy.mock.calls
          .map((call) => call[0])
          .find(
            (entry): entry is string =>
              typeof entry === "string" && entry.startsWith("[notes] list "),
          );
        expect(listDiagnostic).toBeDefined();
        expect(listDiagnostic).toContain('"bucketCount":1');
        expect(listDiagnostic).toContain('"journal":true');
      } finally {
        if (previousDiagnostics === undefined) {
          delete process.env.TODU_NOTES_DIAGNOSTICS;
        } else {
          process.env.TODU_NOTES_DIAGNOSTICS = previousDiagnostics;
        }
        infoSpy.mockRestore();
      }
    });
  });

  describe("update", () => {
    it("updates note content", async () => {
      const created = await todu.note.create({ content: "Original" });
      if (!created.ok) throw new Error("create failed");

      const result = await todu.note.update(created.value.id, { content: "Updated" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.content).toBe("Updated");
      expect(result.value.id).toBe(created.value.id);
    });

    it("updates note tags", async () => {
      const created = await todu.note.create({ content: "Note", tags: ["old"] });
      if (!created.ok) throw new Error("create failed");

      const result = await todu.note.update(created.value.id, { tags: ["new", "updated"] });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.tags).toEqual(["new", "updated"]);
    });

    it("updates both content and tags", async () => {
      const created = await todu.note.create({ content: "Old", tags: ["a"] });
      if (!created.ok) throw new Error("create failed");

      const result = await todu.note.update(created.value.id, {
        content: "New",
        tags: ["b", "c"],
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.content).toBe("New");
      expect(result.value.tags).toEqual(["b", "c"]);
    });

    it("returns NotFound for nonexistent note", async () => {
      const result = await todu.note.update(createNoteId("note-nope"), { content: "x" });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("not-found");
    });

    it("rejects empty content", async () => {
      const created = await todu.note.create({ content: "Note" });
      if (!created.ok) throw new Error("create failed");

      const result = await todu.note.update(created.value.id, { content: "" });
      expect(result.ok).toBe(false);
    });

    it("trims content on save", async () => {
      const created = await todu.note.create({ content: "Note" });
      if (!created.ok) throw new Error("create failed");

      const result = await todu.note.update(created.value.id, { content: "  Trimmed  " });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.content).toBe("Trimmed");
    });

    it("persists update after list", async () => {
      const created = await todu.note.create({ content: "Before" });
      if (!created.ok) throw new Error("create failed");

      await todu.note.update(created.value.id, { content: "After" });

      const list = await todu.note.list();
      expect(list.ok).toBe(true);
      if (!list.ok) return;
      expect(list.value[0].content).toBe("After");
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
      await new Promise((r) => setTimeout(r, 50));

      todu = await createTodu({ storagePath: tmpDir });
      const result = await todu.note.list();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(1);
      expect(result.value[0].content).toBe("Persistent thought");
      expect(result.value[0].tags).toEqual(["journal"]);
    });

    it("stores notes in partitioned bucket documents", async () => {
      const task = await todu.task.create({ title: "Task for notes", projectId });
      if (!task.ok) throw new Error("create failed");

      const journalNote = await todu.note.create({
        content: "Journal",
        createdAt: "2021-04-17T14:30:00Z",
      });
      const taskNote = await todu.note.create({
        content: "Task attached",
        entityType: "task",
        entityId: task.value.id,
      });
      if (!journalNote.ok || !taskNote.ok) throw new Error("create failed");

      await todu.close();
      await new Promise((r) => setTimeout(r, 50));
      todu = await createTodu({ storagePath: tmpDir });

      const catalogDoc = await readCatalogDocument(tmpDir);
      const month = journalNote.value.createdAt.slice(0, 7);
      const journalBucket = `journal:${month}`;
      const taskBucket = `entity:task:${task.value.id}`;

      expect(catalogDoc.notesDocId).toBeUndefined();
      expect(Object.keys(catalogDoc.notesBucketDocIds)).toEqual(
        expect.arrayContaining([journalBucket, taskBucket]),
      );
      expect(catalogDoc.noteBucketByNoteId[journalNote.value.id]).toBe(journalBucket);
      expect(catalogDoc.noteBucketByNoteId[taskNote.value.id]).toBe(taskBucket);
      expect(journalBucket).toBe("journal:2021-04");
    });

    it("migrates legacy notesDocId data into partition buckets", async () => {
      await todu.close();
      await new Promise((r) => setTimeout(r, 50));

      const repo = new Repo({
        storage: new NodeFSStorageAdapter(tmpDir),
      });
      const catalogHandle = repo.create<CatalogDocument>();
      const legacyNotesHandle = repo.create<ReturnType<typeof createNotesDocument>>();
      const legacyTemplate = createNotesDocument();
      const legacyNote: Note = {
        id: createNoteId("note-legacy"),
        content: "Legacy note",
        author: "user",
        tags: ["legacy"],
        createdAt: "2026-02-24T12:00:00.000Z",
      };

      legacyNotesHandle.change((doc) => {
        doc.notes = legacyTemplate.notes;
        doc.notes.push(legacyNote);
      });

      catalogHandle.change((doc) => {
        const empty = createEmptyCatalog();
        doc.version = empty.version;
        doc.projects = empty.projects;
        doc.labels = empty.labels;
        doc.taskListDocIds = empty.taskListDocIds;
        doc.notesBucketDocIds = empty.notesBucketDocIds;
        doc.noteBucketByNoteId = empty.noteBucketByNoteId;
        doc.notesDocId = legacyNotesHandle.documentId;
        doc.recurringTemplates = empty.recurringTemplates;
        doc.habits = empty.habits;
        doc.habitLogDocIds = empty.habitLogDocIds;
        doc.settings = empty.settings;
      });

      fs.writeFileSync(path.join(tmpDir, "todu-catalog.id"), catalogHandle.documentId, "utf-8");
      await repo.flush();
      await repo.shutdown();
      await new Promise((r) => setTimeout(r, 50));

      todu = await createTodu({ storagePath: tmpDir });
      const notes = await todu.note.list();
      expect(notes.ok).toBe(true);
      if (!notes.ok) return;
      expect(notes.value.map((note) => note.id)).toContain(legacyNote.id);

      await todu.close();
      await new Promise((r) => setTimeout(r, 50));
      todu = await createTodu({ storagePath: tmpDir });

      const catalogDoc = await readCatalogDocument(tmpDir);
      expect(catalogDoc.notesDocId).toBeUndefined();
      expect(catalogDoc.noteBucketByNoteId[legacyNote.id]).toBe("journal:2026-02");
    });
  });
});
