import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Repo } from "@automerge/automerge-repo";
import { NodeFSStorageAdapter } from "@automerge/automerge-repo-storage-nodefs";
import {
  type CatalogDocument,
  createActorId,
  createIntegrationBindingId,
  createNoteId,
} from "@todu/core";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Todu, ToduWithInternalTools } from "./index.js";
import { createTodu } from "./index.js";

async function readCatalogDocument(storagePath: string): Promise<CatalogDocument> {
  const markerPath = path.join(storagePath, "todu-catalog.id");
  const catalogId = fs.readFileSync(markerPath, "utf-8").trim();
  const repo = new Repo({
    storage: new NodeFSStorageAdapter(storagePath),
  });

  try {
    const handle = await repo.find<CatalogDocument>(catalogId);
    await handle.whenReady();
    const doc = handle.doc();
    if (!doc) {
      throw new Error("catalog document not available");
    }
    return JSON.parse(JSON.stringify(doc)) as CatalogDocument;
  } finally {
    await repo.shutdown();
  }
}

describe("createTodu", () => {
  let tmpDir: string;
  let todu: Todu | null = null;
  const tmpDirs: string[] = [];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-test-"));
    tmpDirs.push(tmpDir);
  });

  afterEach(async () => {
    if (todu) {
      await todu.close();
      await new Promise((r) => setTimeout(r, 100));
      todu = null;
    }
  });

  afterAll(() => {
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("creates an instance with all namespaces", async () => {
    todu = await createTodu({ storagePath: tmpDir });

    expect(todu.project).toBeDefined();
    expect(todu.task).toBeDefined();
    expect(todu.label).toBeDefined();
    expect(todu.integration).toBeDefined();
    expect(todu.note).toBeDefined();
    expect(todu.recurring).toBeDefined();
    expect(todu.habit).toBeDefined();
    expect(todu.sync).toBeDefined();
    expect(todu.config).toBeDefined();
    expect(todu.close).toBeDefined();
  });

  it("creates data directory if it does not exist", async () => {
    const nestedDir = path.join(tmpDir, "nested", "data");
    todu = await createTodu({ storagePath: nestedDir });

    expect(fs.existsSync(nestedDir)).toBe(true);
  });

  it("creates catalog document on first run", async () => {
    todu = await createTodu({ storagePath: tmpDir });

    // Catalog marker file should exist
    const markerPath = path.join(tmpDir, "todu-catalog.id");
    expect(fs.existsSync(markerPath)).toBe(true);

    const docId = fs.readFileSync(markerPath, "utf-8").trim();
    expect(docId.length).toBeGreaterThan(0);
  });

  it("creates a fresh catalog with the configured bootstrap owner actor", async () => {
    todu = await createTodu({
      storagePath: tmpDir,
      bootstrapOwnerActor: { id: createActorId("erik"), displayName: "Erik" },
    });

    await todu.close();
    todu = null;
    await new Promise((r) => setTimeout(r, 50));

    const catalog = await readCatalogDocument(tmpDir);
    expect(catalog.ownerActorId).toBe("erik");
    expect(catalog.actors).toEqual([{ id: "erik", displayName: "Erik" }]);
  });

  it("loads existing catalog on subsequent runs", async () => {
    // First run — creates catalog
    todu = await createTodu({ storagePath: tmpDir });
    const markerPath = path.join(tmpDir, "todu-catalog.id");
    const firstDocId = fs.readFileSync(markerPath, "utf-8").trim();
    await todu.close();
    await new Promise((r) => setTimeout(r, 50));

    // Second run — loads same catalog
    todu = await createTodu({ storagePath: tmpDir });
    const secondDocId = fs.readFileSync(markerPath, "utf-8").trim();

    expect(secondDocId).toBe(firstDocId);
  });

  it("does not rewrite an already migrated catalog when bootstrap owner config changes", async () => {
    todu = await createTodu({
      storagePath: tmpDir,
      bootstrapOwnerActor: { id: createActorId("erik"), displayName: "Erik" },
    });
    await todu.close();
    todu = null;
    await new Promise((r) => setTimeout(r, 50));

    todu = await createTodu({
      storagePath: tmpDir,
      bootstrapOwnerActor: { id: createActorId("reviewer"), displayName: "Reviewer" },
    });
    await todu.close();
    todu = null;
    await new Promise((r) => setTimeout(r, 50));

    const catalog = await readCatalogDocument(tmpDir);
    expect(catalog.ownerActorId).toBe("erik");
    expect(catalog.actors).toEqual([{ id: "erik", displayName: "Erik" }]);
  });

  it("persists structured comment sync provenance independently from note tags", async () => {
    todu = await createTodu({ storagePath: tmpDir });
    const internalTodu = todu as ToduWithInternalTools;
    const upsertResult = await internalTodu.__internal.syncRuntime.commentProvenance.upsert({
      bindingId: createIntegrationBindingId("ibind-1"),
      provider: "github",
      targetKind: "repository",
      targetRef: "owner/repo",
      localNoteId: createNoteId("note-1"),
      externalTaskId: "gh-task-1",
      externalCommentId: "gh-comment-1",
      lastMirroredAt: "2026-03-10T10:00:00.000Z",
    });
    expect(upsertResult.ok).toBe(true);

    await todu.close();
    todu = null;
    await new Promise((r) => setTimeout(r, 50));

    todu = await createTodu({ storagePath: tmpDir });
    const reopenedTodu = todu as ToduWithInternalTools;
    const listResult = await reopenedTodu.__internal.syncRuntime.commentProvenance.list({
      bindingId: createIntegrationBindingId("ibind-1"),
      localNoteId: createNoteId("note-1"),
    });

    expect(listResult.ok).toBe(true);
    expect(listResult.ok ? listResult.value : []).toEqual([
      expect.objectContaining({
        bindingId: "ibind-1",
        provider: "github",
        targetKind: "repository",
        targetRef: "owner/repo",
        localNoteId: "note-1",
        externalTaskId: "gh-task-1",
        externalCommentId: "gh-comment-1",
        lastMirroredAt: "2026-03-10T10:00:00.000Z",
      }),
    ]);
  });

  it("flushes imported tasks, notes, provenance and mappings before provider progress can be committed", async () => {
    todu = await createTodu({ storagePath: tmpDir });
    const internal = (todu as ToduWithInternalTools).__internal.syncRuntime;
    const project = await todu.project.create({ name: "Imported project" });
    if (!project.ok) throw new Error("project create failed");
    const binding = await todu.integration.create({
      provider: "test",
      projectId: project.value.id,
      targetKind: "repository",
      targetRef: "owner/repo",
      strategy: "pull",
      enabled: true,
    });
    if (!binding.ok) throw new Error("binding create failed");
    const task = await todu.task.create({
      projectId: project.value.id,
      title: "Imported task",
      description: "Saved detail",
      externalId: "external-task",
    });
    if (!task.ok) throw new Error("task create failed");
    const noteId = createNoteId("note-import-test");
    const noteInput = {
      content: "Saved comment",
      entityType: "task" as const,
      entityId: task.value.id,
    };
    const note = await internal.notes.createWithId(noteId, noteInput);
    expect(note.ok).toBe(true);
    await todu.note.update(noteId, { content: "Edited comment" });
    const replay = await internal.notes.createWithId(noteId, noteInput);
    expect(replay.ok && replay.value.content).toBe("Edited comment");
    const provenance = await internal.commentProvenance.upsert({
      bindingId: binding.value.id,
      provider: "test",
      targetKind: "repository",
      targetRef: "owner/repo",
      localNoteId: noteId,
      externalTaskId: "external-task",
      externalCommentId: "external-comment",
      lastMirroredAt: "2026-04-01T00:00:00.000Z",
    });
    expect(provenance.ok).toBe(true);
    const mappings = [{ actorId: createActorId("actor-user"), externalLogin: "external-user" }];
    expect(
      (await todu.integration.update(binding.value.id, { options: { actorMappings: mappings } }))
        .ok,
    ).toBe(true);

    await internal.flush();
    // Snapshot before close: shutdown must not supply the persistence barrier under test.
    const snapshot = fs.mkdtempSync(path.join(os.tmpdir(), "todu-flush-snapshot-"));
    tmpDirs.push(snapshot);
    fs.cpSync(tmpDir, snapshot, { recursive: true });
    const reopened = await createTodu({ storagePath: snapshot });
    try {
      const savedTask = await reopened.task.get(task.value.id);
      expect(savedTask.ok && savedTask.value.description).toBe("Saved detail");
      const notes = await reopened.note.list({ entityType: "task", entityId: task.value.id });
      expect(notes.ok && notes.value).toEqual([
        expect.objectContaining({ id: noteId, content: "Edited comment" }),
      ]);
      const savedBinding = await reopened.integration.get(binding.value.id);
      expect(savedBinding.ok && savedBinding.value.options?.actorMappings).toEqual(mappings);
      const savedProvenance = await (
        reopened as ToduWithInternalTools
      ).__internal.syncRuntime.commentProvenance.list({ bindingId: binding.value.id });
      expect(savedProvenance.ok && savedProvenance.value).toHaveLength(1);
    } finally {
      await reopened.close();
    }
  });

  it("keeps validation and public random-ID note creation unchanged", async () => {
    todu = await createTodu({ storagePath: tmpDir });
    const internal = (todu as ToduWithInternalTools).__internal.syncRuntime;
    expect(
      await internal.notes.createWithId(createNoteId("note-import-invalid"), { content: "" }),
    ).toMatchObject({ ok: false });
    const first = await todu.note.create({ content: "same body" });
    const second = await todu.note.create({ content: "same body" });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(first.ok && first.value.id).not.toBe(second.ok && second.value.id);
  });

  it("returns config via config.get()", async () => {
    todu = await createTodu({ storagePath: tmpDir });
    const config = todu.config.get();
    expect(config.storagePath).toBe(tmpDir);
  });

  it("reports sync status as standalone/disconnected by default", async () => {
    todu = await createTodu({ storagePath: tmpDir });
    const status = todu.sync.status();
    expect(status.local.mode).toBe("standalone");
    expect(status.remote.state).toBe("disconnected");
  });

  it("closes without error", async () => {
    todu = await createTodu({ storagePath: tmpDir });
    await expect(todu.close()).resolves.toBeUndefined();
    todu = null; // prevent double-close in afterEach
  });

  it("onChange fires callback on data change and cleanup unsubscribes", async () => {
    todu = await createTodu({ storagePath: tmpDir });

    let callCount = 0;
    const cleanup = todu.onChange(() => {
      callCount++;
    });

    // Trigger a change by creating a project
    await todu.project.create({ name: "test-project" });
    // Allow async change event to propagate
    await new Promise((r) => setTimeout(r, 100));

    expect(callCount).toBeGreaterThan(0);

    // Unsubscribe
    const countBeforeCleanup = callCount;
    cleanup();

    // Trigger another change — callback should NOT fire
    await todu.project.create({ name: "another-project" });
    await new Promise((r) => setTimeout(r, 100));

    expect(callCount).toBe(countBeforeCleanup);
  });

  it("migrates old catalog missing fields", async () => {
    // Simulate an old catalog with only projects and version
    const repo = new Repo({
      storage: new NodeFSStorageAdapter(tmpDir),
    });
    const handle = repo.create<Partial<CatalogDocument>>();
    handle.change((doc) => {
      doc.version = 1;
      doc.projects = [];
      // Deliberately missing: labels, taskListDocIds, notes bucket fields,
      // integration status doc IDs, recurring templates, habits, and settings.
    });
    const markerPath = path.join(tmpDir, "todu-catalog.id");
    fs.writeFileSync(markerPath, handle.documentId, "utf-8");
    await repo.flush();
    await repo.shutdown();
    await new Promise((r) => setTimeout(r, 50));

    // Load with createTodu — should migrate without crashing
    todu = await createTodu({ storagePath: tmpDir });

    // All operations should work on migrated catalog
    const projects = await todu.project.list();
    expect(projects.ok).toBe(true);

    const tasks = await todu.task.list();
    expect(tasks.ok).toBe(true);

    const labels = await todu.label.list();
    expect(labels.ok).toBe(true);

    const notes = await todu.note.list();
    expect(notes.ok).toBe(true);

    await todu.close();
    todu = null;
    await new Promise((r) => setTimeout(r, 50));

    const migratedCatalog = await readCatalogDocument(tmpDir);
    expect(migratedCatalog.actors).toEqual([{ id: "actor-user", displayName: "user" }]);
    expect(migratedCatalog.ownerActorId).toBe("actor-user");
    expect(migratedCatalog.taskListDocIds).toEqual({});
    expect(migratedCatalog.notesBucketDocIds).toEqual({});
    expect(migratedCatalog.noteBucketByNoteId).toEqual({});
    expect(migratedCatalog.integrationStatusDocIds).toEqual({});
    expect(migratedCatalog.recurringTemplates).toEqual([]);
    expect(migratedCatalog.habits).toEqual([]);
    expect(migratedCatalog.settings.schemaVersion).toBe(3);
  });

  it("migrates old catalogs with the configured bootstrap owner actor", async () => {
    const repo = new Repo({
      storage: new NodeFSStorageAdapter(tmpDir),
    });
    const handle = repo.create<Partial<CatalogDocument>>();
    handle.change((doc) => {
      doc.version = 1;
      doc.projects = [];
    });
    const markerPath = path.join(tmpDir, "todu-catalog.id");
    fs.writeFileSync(markerPath, handle.documentId, "utf-8");
    await repo.flush();
    await repo.shutdown();
    await new Promise((r) => setTimeout(r, 50));

    todu = await createTodu({
      storagePath: tmpDir,
      bootstrapOwnerActor: { id: createActorId("erik"), displayName: "Erik" },
    });
    await todu.close();
    todu = null;
    await new Promise((r) => setTimeout(r, 50));

    const migratedCatalog = await readCatalogDocument(tmpDir);
    expect(migratedCatalog.actors).toEqual([{ id: "erik", displayName: "Erik" }]);
    expect(migratedCatalog.ownerActorId).toBe("erik");
    expect(migratedCatalog.settings.schemaVersion).toBe(3);
  });
});
