import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DocumentId } from "@automerge/automerge-repo";
import {
  createActorId,
  createProjectId,
  createTaskId,
  createTaskListDocument,
  type TaskListDocument,
} from "@todu/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { beginCatalogJoinSwitch, initBootstrapStorage, initJoinStorage } from "./storage.js";

const UNREACHABLE_CATALOG_ID = "2sFuwGcFcU9fkQDnYCdveNPoF6nK" as DocumentId;

async function nextTick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("storage bootstrap/join boundaries", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-storage-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("bootstrap creates initial catalog when marker is missing", async () => {
    const storage = await initBootstrapStorage(tmpDir);

    const markerPath = path.join(tmpDir, "todu-catalog.id");
    expect(fs.existsSync(markerPath)).toBe(true);
    const marker = fs.readFileSync(markerPath, "utf-8").trim();
    expect(marker).toBe(storage.catalog.documentId);

    await storage.close();
  });

  it("bootstrap does not create replacement catalog when marker is unreachable", async () => {
    const markerPath = path.join(tmpDir, "todu-catalog.id");
    fs.writeFileSync(markerPath, UNREACHABLE_CATALOG_ID, "utf-8");

    await expect(initBootstrapStorage(tmpDir)).rejects.toThrow("bootstrap catalog");

    expect(fs.readFileSync(markerPath, "utf-8").trim()).toBe(UNREACHABLE_CATALOG_ID);
  });

  it("join path never creates a fresh catalog when target is unreachable", async () => {
    await expect(initJoinStorage(tmpDir, UNREACHABLE_CATALOG_ID)).rejects.toThrow("join catalog");

    const markerPath = path.join(tmpDir, "todu-catalog.id");
    expect(fs.existsSync(markerPath)).toBe(false);
  });

  it("failed bootstrap init cleans up owned repo without async storage leaks", async () => {
    for (let i = 0; i < 20; i += 1) {
      const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-storage-bootstrap-fail-"));
      const markerPath = path.join(runDir, "todu-catalog.id");
      fs.writeFileSync(markerPath, UNREACHABLE_CATALOG_ID, "utf-8");

      await expect(initBootstrapStorage(runDir)).rejects.toThrow("bootstrap catalog");

      fs.rmSync(runDir, { recursive: true, force: true });
      await nextTick();
    }
  });

  it("failed join init cleans up owned repo without async storage leaks", async () => {
    for (let i = 0; i < 20; i += 1) {
      const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-storage-join-fail-"));

      await expect(initJoinStorage(runDir, UNREACHABLE_CATALOG_ID)).rejects.toThrow("join catalog");

      fs.rmSync(runDir, { recursive: true, force: true });
      await nextTick();
    }
  });

  it("join switch rollback restores prior marker", () => {
    const markerPath = path.join(tmpDir, "todu-catalog.id");
    const previous = "2Y2aJ8G8MSYn6wVqVEf4GQ9B5m5H" as DocumentId;
    const target = UNREACHABLE_CATALOG_ID;

    fs.writeFileSync(markerPath, previous, "utf-8");

    const tx = beginCatalogJoinSwitch(tmpDir, target);
    expect(fs.readFileSync(markerPath, "utf-8").trim()).toBe(target);

    tx.rollback();
    expect(fs.readFileSync(markerPath, "utf-8").trim()).toBe(previous);
  });

  it("join switch rollback removes marker when no prior catalog existed", () => {
    const markerPath = path.join(tmpDir, "todu-catalog.id");
    const target = UNREACHABLE_CATALOG_ID;

    const tx = beginCatalogJoinSwitch(tmpDir, target);
    expect(fs.readFileSync(markerPath, "utf-8").trim()).toBe(target);

    tx.rollback();
    expect(fs.existsSync(markerPath)).toBe(false);
  });

  it("bootstrap tolerates missing task detail docs during canonical actor repair", async () => {
    const storage = await initBootstrapStorage(tmpDir);
    const projectId = createProjectId("proj-repair");
    const taskId = createTaskId("task-missing-detail");
    const legacyActorId = createActorId("actor-legacy-alice");
    const canonicalActorId = createActorId("actor-alice");
    const now = "2026-07-04T12:00:00.000Z";

    const taskListHandle = storage.repo.create<TaskListDocument>();
    taskListHandle.change((doc) => {
      const template = createTaskListDocument(projectId);
      doc.projectId = template.projectId;
      doc.tasks = [
        {
          id: taskId,
          title: "Task with missing detail doc",
          status: "done",
          priority: "medium",
          projectId,
          labels: [],
          assigneeActorIds: [legacyActorId],
          assignees: [],
          createdAt: now,
          updatedAt: now,
        },
      ];
      doc.detailDocIds = {
        [taskId]: UNREACHABLE_CATALOG_ID,
      };
      doc.descriptionSearchTextByTaskId = {};
    });

    storage.catalog.change((doc) => {
      doc.actors.push(
        { id: legacyActorId, displayName: "Alice" },
        { id: canonicalActorId, displayName: "Alice" },
      );
      doc.projects.push({
        id: projectId,
        name: "Repair Project",
        status: "active",
        priority: "medium",
        authorizedAssigneeActorIds: [legacyActorId],
        createdAt: now,
        updatedAt: now,
      });
      doc.taskListDocIds[projectId] = taskListHandle.documentId;
    });

    await storage.close();

    const reloaded = await initBootstrapStorage(tmpDir);
    const project = reloaded.catalog
      .doc()
      ?.projects.find((candidate) => candidate.id === projectId);
    expect(project?.authorizedAssigneeActorIds).toEqual([canonicalActorId]);

    const reloadedTaskList = await reloaded.repo.find<TaskListDocument>(taskListHandle.documentId);
    await reloadedTaskList.whenReady();
    expect(reloadedTaskList.doc()?.tasks[0].assigneeActorIds).toEqual([legacyActorId]);
    expect(reloadedTaskList.doc()?.detailDocIds[taskId]).toBe(UNREACHABLE_CATALOG_ID);

    await reloaded.close();
  });
});
