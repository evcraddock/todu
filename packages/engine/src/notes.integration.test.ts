import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DocumentId } from "@automerge/automerge-repo";
import { Repo } from "@automerge/automerge-repo";
import { NodeFSStorageAdapter } from "@automerge/automerge-repo-storage-nodefs";
import {
  type CatalogDocument,
  createActorId,
  createEmptyCatalog,
  createIntegrationBindingId,
  createNoteId,
  createNotesDocument,
  DEFAULT_OWNER_ACTOR_ID,
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

async function seedLegacyNoteIdentityData(
  storagePath: string,
  legacyAuthorsByNoteId: Record<string, string | null | undefined>,
  owner: { id: string; displayName: string } = {
    id: DEFAULT_OWNER_ACTOR_ID,
    displayName: "user",
  },
): Promise<void> {
  const markerPath = path.join(storagePath, "todu-catalog.id");
  const catalogId = fs.readFileSync(markerPath, "utf-8").trim() as DocumentId;

  const repo = new Repo({
    storage: new NodeFSStorageAdapter(storagePath),
  });

  try {
    const catalogHandle = await repo.find<CatalogDocument>(catalogId);
    await catalogHandle.whenReady();
    catalogHandle.change((doc) => {
      doc.version = 1;
      doc.settings.schemaVersion = 1;
      doc.actors.splice(0, doc.actors.length, {
        id: createActorId(owner.id),
        displayName: owner.displayName,
      });
      doc.ownerActorId = createActorId(owner.id);
    });

    const bucketDocIds = Object.values(catalogHandle.doc()?.notesBucketDocIds ?? {});
    for (const docId of bucketDocIds) {
      const notesHandle = await repo.find(docId as DocumentId);
      await notesHandle.whenReady();
      notesHandle.change((doc) => {
        for (const note of doc.notes as Array<Note & { author?: string; authorActorId?: string }>) {
          if (!(note.id in legacyAuthorsByNoteId)) continue;
          delete note.authorActorId;
          const legacyAuthor = legacyAuthorsByNoteId[note.id];
          if (legacyAuthor === undefined) {
            delete note.author;
          } else if (legacyAuthor === null) {
            note.author = "";
          } else {
            note.author = legacyAuthor;
          }
        }
      });
    }

    await repo.flush();
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
      expect(result.value.authorActorId).toBe(DEFAULT_OWNER_ACTOR_ID);
      expect(result.value.contentApproval).toEqual({
        state: "notRequired",
        sourceFingerprint: expect.any(String),
      });
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

    it("creates a note with author actor id", async () => {
      const result = await todu.note.create({
        content: "Actor-authored note",
        authorActorId: createActorId("actor-user"),
        contentApproval: {
          state: "pendingApproval",
          sourceBindingId: createIntegrationBindingId("ibind-1"),
          sourceActorId: createActorId("actor-user"),
        },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.authorActorId).toBe("actor-user");
      expect(result.value.contentApproval).toEqual({
        state: "pendingApproval",
        sourceBindingId: "ibind-1",
        sourceActorId: "actor-user",
        sourceFingerprint: expect.any(String),
      });
    });

    it("rejects unknown author actor id", async () => {
      const result = await todu.note.create({
        content: "Actor-authored note",
        authorActorId: createActorId("actor-missing"),
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("not-found");
      expect(result.error.entity).toBe("actor");
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

    it("migrates legacy note authors into actor ids and reuses normalized actors across restarts", async () => {
      const first = await todu.note.create({ content: "First note" });
      const second = await todu.note.create({ content: "Second note" });
      const third = await todu.note.create({ content: "Third note" });
      if (!first.ok || !second.ok || !third.ok) throw new Error("create failed");

      await todu.close();
      await new Promise((r) => setTimeout(r, 50));

      await seedLegacyNoteIdentityData(tmpDir, {
        [first.value.id]: " Alice ",
        [second.value.id]: "",
        [third.value.id]: undefined,
      });

      todu = await createTodu({ storagePath: tmpDir });

      const result = await todu.note.list();
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const migratedFirst = result.value.find((note) => note.id === first.value.id);
      const migratedSecond = result.value.find((note) => note.id === second.value.id);
      const migratedThird = result.value.find((note) => note.id === third.value.id);
      expect(migratedFirst?.authorActorId).toEqual(expect.any(String));
      expect(migratedFirst?.authorActorId).not.toBe(DEFAULT_OWNER_ACTOR_ID);
      expect(migratedSecond?.authorActorId).toBe(DEFAULT_OWNER_ACTOR_ID);
      expect(migratedThird?.authorActorId).toBe(DEFAULT_OWNER_ACTOR_ID);

      await todu.close();
      await new Promise((r) => setTimeout(r, 50));

      const catalog = await readCatalogDocument(tmpDir);
      expect(catalog.version).toBe(2);
      expect(catalog.settings.schemaVersion).toBe(2);
      expect(catalog.actors).toEqual([
        { id: DEFAULT_OWNER_ACTOR_ID, displayName: "user" },
        { id: migratedFirst?.authorActorId, displayName: "Alice" },
      ]);

      todu = await createTodu({ storagePath: tmpDir });

      const afterRestart = await todu.note.list();
      expect(afterRestart.ok).toBe(true);
      if (!afterRestart.ok) return;
      expect(afterRestart.value.find((note) => note.id === first.value.id)?.authorActorId).toBe(
        migratedFirst?.authorActorId,
      );
    });

    it("maps legacy missing or 'user' note authors to the current owner actor during migration", async () => {
      const first = await todu.note.create({ content: "Legacy user note" });
      const second = await todu.note.create({ content: "Legacy missing note" });
      if (!first.ok || !second.ok) throw new Error("create failed");

      await todu.close();
      await new Promise((r) => setTimeout(r, 50));

      await seedLegacyNoteIdentityData(
        tmpDir,
        {
          [first.value.id]: "user",
          [second.value.id]: undefined,
        },
        {
          id: "actor-reviewer",
          displayName: "Reviewer",
        },
      );

      todu = await createTodu({ storagePath: tmpDir });

      const result = await todu.note.list();
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.find((note) => note.id === first.value.id)?.authorActorId).toBe(
        "actor-reviewer",
      );
      expect(result.value.find((note) => note.id === second.value.id)?.authorActorId).toBe(
        "actor-reviewer",
      );
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
      expect(result.value.contentApproval).toEqual({
        state: "notRequired",
        sourceFingerprint: expect.any(String),
      });
      expect(result.value.id).toBe(created.value.id);
    });

    it("updates note approval metadata without changing content", async () => {
      const created = await todu.note.create({ content: "Original" });
      if (!created.ok) throw new Error("create failed");

      const result = await todu.note.update(created.value.id, {
        contentApproval: {
          state: "approved",
          sourceBindingId: createIntegrationBindingId("ibind-1"),
          sourceActorId: createActorId("actor-user"),
          reviewedAt: "2026-04-13T00:00:00Z",
          reviewedByActorId: createActorId("actor-user"),
        },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.content).toBe("Original");
      expect(result.value.contentApproval).toEqual({
        state: "approved",
        sourceBindingId: "ibind-1",
        sourceActorId: "actor-user",
        reviewedAt: "2026-04-13T00:00:00Z",
        reviewedByActorId: "actor-user",
        sourceFingerprint: expect.any(String),
      });
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

      const approved = await todu.note.update(created.value.id, {
        contentApproval: {
          state: "approved",
          sourceBindingId: createIntegrationBindingId("ibind-1"),
          sourceActorId: createActorId("actor-user"),
          reviewedAt: "2026-04-13T00:00:00Z",
          reviewedByActorId: createActorId("actor-user"),
        },
      });
      if (!approved.ok) throw new Error("approval update failed");

      const result = await todu.note.update(created.value.id, {
        content: "New",
        tags: ["b", "c"],
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.content).toBe("New");
      expect(result.value.tags).toEqual(["b", "c"]);
      expect(result.value.contentApproval).toEqual({
        state: "notRequired",
        sourceFingerprint: expect.any(String),
      });
      expect(result.value.contentApproval?.sourceFingerprint).not.toBe(
        approved.value.contentApproval?.sourceFingerprint,
      );
    });

    it("updates note author actor id", async () => {
      const created = await todu.note.create({ content: "Original" });
      if (!created.ok) throw new Error("create failed");

      const result = await todu.note.update(created.value.id, {
        authorActorId: createActorId("actor-user"),
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.authorActorId).toBe("actor-user");
    });

    it("rejects unknown note author actor id updates", async () => {
      const created = await todu.note.create({ content: "Original" });
      if (!created.ok) throw new Error("create failed");

      const result = await todu.note.update(created.value.id, {
        authorActorId: createActorId("actor-missing"),
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("not-found");
      expect(result.error.entity).toBe("actor");
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
      await todu.note.create({
        content: "Persistent thought",
        tags: ["journal"],
        contentApproval: {
          state: "approved",
          sourceBindingId: createIntegrationBindingId("ibind-1"),
          sourceActorId: createActorId("actor-user"),
          reviewedAt: "2026-04-13T00:00:00Z",
          reviewedByActorId: createActorId("actor-user"),
        },
      });
      await todu.close();
      await new Promise((r) => setTimeout(r, 50));

      todu = await createTodu({ storagePath: tmpDir });
      const result = await todu.note.list();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(1);
      expect(result.value[0].content).toBe("Persistent thought");
      expect(result.value[0].tags).toEqual(["journal"]);
      expect(result.value[0].contentApproval).toEqual({
        state: "approved",
        sourceBindingId: "ibind-1",
        sourceActorId: "actor-user",
        reviewedAt: "2026-04-13T00:00:00Z",
        reviewedByActorId: "actor-user",
        sourceFingerprint: expect.any(String),
      });
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
      expect(catalogDoc.noteBucketByNoteId).toEqual({});
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
      expect(catalogDoc.noteBucketByNoteId).toEqual({});
    });

    it("clears legacy note bucket indexes and still updates notes", async () => {
      const created = await todu.note.create({
        content: "Indexed note",
        createdAt: "2026-02-24T12:00:00.000Z",
      });
      if (!created.ok) throw new Error("create failed");

      await todu.close();
      await new Promise((r) => setTimeout(r, 50));

      const repo = new Repo({
        storage: new NodeFSStorageAdapter(tmpDir),
      });
      const catalogDocId = fs.readFileSync(path.join(tmpDir, "todu-catalog.id"), "utf-8").trim();
      const catalogHandle = await repo.find<CatalogDocument>(catalogDocId as DocumentId);
      catalogHandle.change((doc) => {
        doc.noteBucketByNoteId = { [created.value.id]: "journal:2026-02" };
      });
      await repo.flush();
      await repo.shutdown();
      await new Promise((r) => setTimeout(r, 50));

      todu = await createTodu({ storagePath: tmpDir });
      const updated = await todu.note.update(created.value.id, { content: "Updated note" });
      expect(updated.ok).toBe(true);
      if (!updated.ok) return;
      expect(updated.value.content).toBe("Updated note");

      await todu.close();
      await new Promise((r) => setTimeout(r, 50));
      todu = await createTodu({ storagePath: tmpDir });

      const catalogDoc = await readCatalogDocument(tmpDir);
      expect(catalogDoc.noteBucketByNoteId).toEqual({});
    });
  });
});
