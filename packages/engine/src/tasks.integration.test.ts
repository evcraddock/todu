import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Repo } from "@automerge/automerge-repo";
import { NodeFSStorageAdapter } from "@automerge/automerge-repo-storage-nodefs";
import type { CatalogDocument, ProjectId, Task, TaskId, TaskListDocument } from "@todu/core";
import { createProjectId, createTaskId } from "@todu/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Todu } from "./index.js";
import { createTodu } from "./index.js";

async function removeTaskArrays(
  storagePath: string,
  projectId: ProjectId,
  taskId: TaskId,
): Promise<void> {
  const markerPath = path.join(storagePath, "todu-catalog.id");
  const catalogId = fs.readFileSync(markerPath, "utf-8").trim();
  const repo = new Repo({
    storage: new NodeFSStorageAdapter(storagePath),
  });

  try {
    const catalogHandle = await repo.find<CatalogDocument>(catalogId);
    await catalogHandle.whenReady();
    const taskListDocId = catalogHandle.doc()?.taskListDocIds[projectId];
    if (!taskListDocId) {
      throw new Error(`task list not found for project ${projectId}`);
    }

    const taskListHandle = await repo.find<TaskListDocument>(taskListDocId);
    await taskListHandle.whenReady();
    taskListHandle.change((doc) => {
      const legacyTask = doc.tasks.find((task) => task.id === taskId) as
        | (Task & { labels?: string[]; assignees?: string[] })
        | undefined;
      if (!legacyTask) {
        throw new Error(`task not found: ${taskId}`);
      }

      delete legacyTask.labels;
      delete legacyTask.assignees;
    });
    await repo.flush();
  } finally {
    await repo.shutdown();
  }
}

describe("task namespace", () => {
  let tmpDir: string;
  let todu: Todu;
  let projectId: ProjectId;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-task-test-"));
    todu = await createTodu({ storagePath: tmpDir });

    // Create a project for tasks
    const result = await todu.project.create({ name: "Test Project" });
    if (!result.ok) throw new Error("Failed to create project");
    projectId = result.value.id;
  });

  afterEach(async () => {
    await todu.close();
    await new Promise((r) => setTimeout(r, 50));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("create", () => {
    it("creates a task with required fields", async () => {
      const result = await todu.task.create({ title: "Fix bug", projectId });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.title).toBe("Fix bug");
      expect(result.value.status).toBe("active");
      expect(result.value.priority).toBe("medium");
      expect(result.value.projectId).toBe(projectId);
      expect(result.value.labels).toEqual([]);
      expect(result.value.assignees).toEqual([]);
      expect(result.value.id).toMatch(/^task-/);
    });

    it("creates a task with assignees", async () => {
      const result = await todu.task.create({
        title: "Assigned task",
        projectId,
        assignees: ["alice", "bob"],
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.assignees).toEqual(["alice", "bob"]);
    });

    it("creates a task with all optional fields", async () => {
      const result = await todu.task.create({
        title: "Full Task",
        projectId,
        priority: "high",
        description: "Detailed description",
        labels: ["bug", "urgent"],
        dueDate: "2026-04-01",
        scheduledDate: "2026-03-30",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.priority).toBe("high");
      expect(result.value.description).toBe("Detailed description");
      expect(result.value.labels).toEqual(["bug", "urgent"]);
      expect(result.value.dueDate).toBe("2026-04-01");
      expect(result.value.scheduledDate).toBe("2026-03-30");
    });

    it("creates a task with sync linkage fields", async () => {
      const result = await todu.task.create({
        title: "Synced Task",
        projectId,
        status: "waiting",
        externalId: "gh-101",
        sourceUrl: "https://example.com/issues/101",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.status).toBe("waiting");
      expect(result.value.externalId).toBe("gh-101");
      expect(result.value.sourceUrl).toBe("https://example.com/issues/101");
    });

    it("creates a task with imported timestamps", async () => {
      const result = await todu.task.create({
        title: "Imported task",
        projectId,
        createdAt: "2021-04-17T14:30:00Z",
        updatedAt: "2021-04-18T09:15:00Z",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.createdAt).toBe("2021-04-17T14:30:00.000Z");
      expect(result.value.updatedAt).toBe("2021-04-18T09:15:00.000Z");
    });

    it("falls back imported updatedAt to createdAt on create", async () => {
      const result = await todu.task.create({
        title: "Imported task",
        projectId,
        createdAt: "2021-04-17T14:30:00Z",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.createdAt).toBe("2021-04-17T14:30:00.000Z");
      expect(result.value.updatedAt).toBe("2021-04-17T14:30:00.000Z");
    });

    it("trims whitespace from title", async () => {
      const result = await todu.task.create({ title: "  Trimmed  ", projectId });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.title).toBe("Trimmed");
    });

    it("returns validation error for empty title", async () => {
      const result = await todu.task.create({ title: "", projectId });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("validation");
    });

    it("returns NotFound for nonexistent project", async () => {
      const result = await todu.task.create({
        title: "Test",
        projectId: createProjectId("proj-nope"),
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("not-found");
    });
  });

  describe("list", () => {
    it("returns empty list when no tasks exist", async () => {
      const result = await todu.task.list();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual([]);
    });

    it("returns all tasks", async () => {
      await todu.task.create({ title: "Task A", projectId });
      await todu.task.create({ title: "Task B", projectId });

      const result = await todu.task.list();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(2);
    });

    it("lists legacy tasks missing labels and assignees", async () => {
      const created = await todu.task.create({ title: "Legacy task", projectId });
      if (!created.ok) throw new Error("create failed");

      await todu.close();
      await new Promise((r) => setTimeout(r, 50));

      await removeTaskArrays(tmpDir, projectId, created.value.id);

      todu = await createTodu({ storagePath: tmpDir });

      const result = await todu.task.list();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(1);
      expect(result.value[0].title).toBe("Legacy task");
      expect(result.value[0].labels).toEqual([]);
      expect(result.value[0].assignees).toEqual([]);
    });

    it("filters by status", async () => {
      const created = await todu.task.create({ title: "Task A", projectId });
      if (!created.ok) throw new Error("create failed");
      await todu.task.update(created.value.id, { status: "done" });
      await todu.task.create({ title: "Task B", projectId });

      const result = await todu.task.list({ status: "active" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(1);
      expect(result.value[0].title).toBe("Task B");
    });

    it("filters by priority", async () => {
      await todu.task.create({ title: "High", projectId, priority: "high" });
      await todu.task.create({ title: "Low", projectId, priority: "low" });

      const result = await todu.task.list({ priority: "high" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(1);
      expect(result.value[0].title).toBe("High");
    });

    it("filters by project", async () => {
      const proj2 = await todu.project.create({ name: "Other Project" });
      if (!proj2.ok) throw new Error("create failed");

      await todu.task.create({ title: "In main", projectId });
      await todu.task.create({ title: "In other", projectId: proj2.value.id });

      const result = await todu.task.list({ projectId });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(1);
      expect(result.value[0].title).toBe("In main");
    });

    it("filters by label", async () => {
      await todu.task.create({ title: "Bug", projectId, labels: ["bug"] });
      await todu.task.create({ title: "Feature", projectId, labels: ["feature"] });

      const result = await todu.task.list({ label: "bug" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(1);
      expect(result.value[0].title).toBe("Bug");
    });

    it("filters by created-at date range", async () => {
      await todu.task.create({
        title: "February task",
        projectId,
        createdAt: "2026-02-20T12:00:00Z",
      });
      await todu.task.create({
        title: "March task",
        projectId,
        createdAt: "2026-03-12T08:30:00Z",
      });
      await todu.task.create({
        title: "Late March task",
        projectId,
        createdAt: "2026-03-28T18:45:00Z",
      });
      await todu.task.create({
        title: "April task",
        projectId,
        createdAt: "2026-04-01T09:00:00Z",
      });

      const result = await todu.task.list({
        createdFrom: "2026-03-01",
        createdTo: "2026-03-31",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.map((task) => task.title)).toEqual(["Late March task", "March task"]);
    });

    it("rejects invalid created-at date range filters", async () => {
      const result = await todu.task.list({ createdFrom: "not-a-date" });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("validation");
      if (result.error.type !== "validation") return;
      expect(result.error.field).toBe("createdFrom");
    });

    it("sorts by priority desc then createdAt desc", async () => {
      await todu.task.create({ title: "Low", projectId, priority: "low" });
      await todu.task.create({ title: "High", projectId, priority: "high" });
      await todu.task.create({ title: "Medium", projectId, priority: "medium" });

      const result = await todu.task.list();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.map((t) => t.title)).toEqual(["High", "Medium", "Low"]);
    });

    it("lists across multiple projects", async () => {
      const proj2 = await todu.project.create({ name: "Project 2" });
      if (!proj2.ok) throw new Error("create failed");

      await todu.task.create({ title: "Task 1", projectId });
      await todu.task.create({ title: "Task 2", projectId: proj2.value.id });

      const result = await todu.task.list();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(2);
    });

    it("filters by multiple statuses", async () => {
      const t1 = await todu.task.create({ title: "Stays active", projectId });
      const t2 = await todu.task.create({ title: "Started", projectId });
      await todu.task.create({ title: "Never updated", projectId });
      if (!t1.ok || !t2.ok) throw new Error("create failed");
      await todu.task.update(t2.value.id, { status: "inprogress" });
      const t3 = await todu.task.create({ title: "Completed", projectId });
      if (!t3.ok) throw new Error("create failed");
      await todu.task.update(t3.value.id, { status: "done" });

      // "Stays active", "Started" (inprogress), and "Never updated" (still active) match
      const result = await todu.task.list({ status: ["active", "inprogress"] });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(3);
    });

    it("filters overdue tasks", async () => {
      await todu.task.create({ title: "Overdue", projectId, dueDate: "2020-01-01" });
      await todu.task.create({ title: "Future", projectId, dueDate: "2099-12-31" });
      await todu.task.create({ title: "No due", projectId });

      const result = await todu.task.list({ overdue: true });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(1);
      expect(result.value[0].title).toBe("Overdue");
    });

    it("filters today tasks", async () => {
      const today = new Date().toISOString().slice(0, 10);
      await todu.task.create({ title: "Due today", projectId, dueDate: today });
      await todu.task.create({ title: "Scheduled today", projectId, scheduledDate: today });
      await todu.task.create({ title: "Tomorrow", projectId, dueDate: "2099-12-31" });

      const result = await todu.task.list({ today: true });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(2);
    });

    it("sorts by title ascending", async () => {
      await todu.task.create({ title: "Charlie", projectId });
      await todu.task.create({ title: "Alpha", projectId });
      await todu.task.create({ title: "Bravo", projectId });

      const result = await todu.task.list(undefined, { field: "title", direction: "asc" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.map((t) => t.title)).toEqual(["Alpha", "Bravo", "Charlie"]);
    });

    it("sorts by dueDate descending, missing dates last", async () => {
      await todu.task.create({ title: "Early", projectId, dueDate: "2026-01-01" });
      await todu.task.create({ title: "Late", projectId, dueDate: "2026-12-31" });
      await todu.task.create({ title: "No due", projectId });

      const result = await todu.task.list(undefined, { field: "dueDate", direction: "desc" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // Missing dates always sort last regardless of direction
      expect(result.value[0].title).toBe("Late");
      expect(result.value[1].title).toBe("Early");
      expect(result.value[2].title).toBe("No due");
    });

    it("filters by updatedFrom/updatedTo", async () => {
      // Create task in January, mark done in March
      const janTask = await todu.task.create({
        title: "Jan created, Mar done",
        projectId,
        createdAt: "2026-01-15T12:00:00.000Z",
      });
      if (!janTask.ok) throw new Error("create failed");
      await todu.task.update(janTask.value.id, {
        status: "done",
        updatedAt: "2026-03-15T12:00:00.000Z",
      });

      // Create task in March, mark done in April
      const marTask = await todu.task.create({
        title: "Mar created, Apr done",
        projectId,
        createdAt: "2026-03-10T12:00:00.000Z",
      });
      if (!marTask.ok) throw new Error("create failed");
      await todu.task.update(marTask.value.id, {
        status: "done",
        updatedAt: "2026-04-05T12:00:00.000Z",
      });

      // Query for done tasks updated in March
      const result = await todu.task.list({
        status: "done",
        updatedFrom: "2026-03-01",
        updatedTo: "2026-03-31",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(1);
      expect(result.value[0].title).toBe("Jan created, Mar done");
    });

    it("excludes done tasks updated outside the window", async () => {
      const task = await todu.task.create({
        title: "Apr done",
        projectId,
        createdAt: "2026-03-01T12:00:00.000Z",
      });
      if (!task.ok) throw new Error("create failed");
      await todu.task.update(task.value.id, {
        status: "done",
        updatedAt: "2026-04-05T12:00:00.000Z",
      });

      const result = await todu.task.list({
        status: "done",
        updatedFrom: "2026-03-01",
        updatedTo: "2026-03-31",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(0);
    });

    it("existing creation-date filters still work alongside updatedAt filters", async () => {
      // Create in January, mark done in March
      const task = await todu.task.create({
        title: "Cross-range",
        projectId,
        createdAt: "2026-01-15T12:00:00.000Z",
      });
      if (!task.ok) throw new Error("create failed");
      await todu.task.update(task.value.id, {
        status: "done",
        updatedAt: "2026-03-15T12:00:00.000Z",
      });

      // createdFrom in January should find it
      const byCreated = await todu.task.list({
        createdFrom: "2026-01-01",
        createdTo: "2026-01-31",
      });
      expect(byCreated.ok).toBe(true);
      if (!byCreated.ok) return;
      expect(byCreated.value).toHaveLength(1);

      // updatedFrom in March should find it
      const byUpdated = await todu.task.list({
        updatedFrom: "2026-03-01",
        updatedTo: "2026-03-31",
      });
      expect(byUpdated.ok).toBe(true);
      if (!byUpdated.ok) return;
      expect(byUpdated.value).toHaveLength(1);
    });
  });

  describe("get", () => {
    it("returns task with description", async () => {
      const created = await todu.task.create({
        title: "With desc",
        projectId,
        description: "Full description here",
      });
      if (!created.ok) throw new Error("create failed");

      const result = await todu.task.get(created.value.id);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.title).toBe("With desc");
      expect(result.value.description).toBe("Full description here");
    });

    it("returns task without description", async () => {
      const created = await todu.task.create({ title: "No desc", projectId });
      if (!created.ok) throw new Error("create failed");

      const result = await todu.task.get(created.value.id);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.description).toBeUndefined();
    });

    it("returns NotFound for nonexistent task", async () => {
      const result = await todu.task.get(createTaskId("task-nope"));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("not-found");
    });
  });

  describe("update", () => {
    let taskId: TaskId;

    beforeEach(async () => {
      const result = await todu.task.create({
        title: "Original",
        projectId,
        description: "Original desc",
      });
      if (!result.ok) throw new Error("create failed");
      taskId = result.value.id;
    });

    it("updates title", async () => {
      const result = await todu.task.update(taskId, { title: "Updated" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.title).toBe("Updated");
    });

    it("updates status", async () => {
      const result = await todu.task.update(taskId, { status: "inprogress" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.status).toBe("inprogress");
    });

    it("updates description", async () => {
      const result = await todu.task.update(taskId, { description: "New desc" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.description).toBe("New desc");
    });

    it("adds description to task that had none", async () => {
      const bare = await todu.task.create({ title: "No desc yet", projectId });
      if (!bare.ok) throw new Error("create failed");

      const result = await todu.task.update(bare.value.id, { description: "Added later" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.description).toBe("Added later");
    });

    it("updates labels", async () => {
      const result = await todu.task.update(taskId, { labels: ["bug", "p1"] });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.labels).toEqual(["bug", "p1"]);
    });

    it("updates assignees", async () => {
      const result = await todu.task.update(taskId, { assignees: ["alice", "bob"] });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.assignees).toEqual(["alice", "bob"]);
    });

    it("updates sync linkage fields", async () => {
      const result = await todu.task.update(taskId, {
        externalId: "gh-101",
        sourceUrl: "https://example.com/issues/101",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.externalId).toBe("gh-101");
      expect(result.value.sourceUrl).toBe("https://example.com/issues/101");
    });

    it("updates imported updatedAt without changing createdAt", async () => {
      const imported = await todu.task.create({
        title: "Imported task",
        projectId,
        createdAt: "2021-04-17T14:30:00Z",
        updatedAt: "2021-04-18T09:15:00Z",
      });
      if (!imported.ok) throw new Error("create failed");

      const result = await todu.task.update(imported.value.id, {
        title: "Updated import",
        updatedAt: "2021-05-01T12:00:00Z",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.title).toBe("Updated import");
      expect(result.value.createdAt).toBe("2021-04-17T14:30:00.000Z");
      expect(result.value.updatedAt).toBe("2021-05-01T12:00:00.000Z");
    });

    it("replaces assignees entirely on update", async () => {
      await todu.task.update(taskId, { assignees: ["alice", "bob"] });
      const result = await todu.task.update(taskId, { assignees: ["charlie"] });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.assignees).toEqual(["charlie"]);
    });

    it("rejects invalid status transition", async () => {
      await todu.task.update(taskId, { status: "done" });
      const result = await todu.task.update(taskId, { status: "inprogress" });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("validation");
    });

    it("returns NotFound for nonexistent task", async () => {
      const result = await todu.task.update(createTaskId("task-nope"), { title: "X" });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("not-found");
    });

    it("returns existing description when updating other fields", async () => {
      const result = await todu.task.update(taskId, { title: "Changed title" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.description).toBe("Original desc");
    });
  });

  describe("delete", () => {
    it("deletes an existing task", async () => {
      const created = await todu.task.create({ title: "To delete", projectId });
      if (!created.ok) throw new Error("create failed");

      const result = await todu.task.delete(created.value.id);
      expect(result.ok).toBe(true);

      const list = await todu.task.list();
      expect(list.ok).toBe(true);
      if (!list.ok) return;
      expect(list.value).toHaveLength(0);
    });

    it("returns NotFound for nonexistent task", async () => {
      const result = await todu.task.delete(createTaskId("task-nope"));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("not-found");
    });
  });

  describe("move", () => {
    it("moves a task between projects", async () => {
      const proj2 = await todu.project.create({ name: "Target" });
      if (!proj2.ok) throw new Error("create failed");

      const created = await todu.task.create({
        title: "Movable",
        projectId,
        description: "Moving desc",
      });
      if (!created.ok) throw new Error("create failed");

      const result = await todu.task.move(created.value.id, proj2.value.id);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.projectId).toBe(proj2.value.id);
      expect(result.value.description).toBe("Moving desc");

      // Verify it's in the target project
      const targetTasks = await todu.task.list({ projectId: proj2.value.id });
      expect(targetTasks.ok).toBe(true);
      if (!targetTasks.ok) return;
      expect(targetTasks.value).toHaveLength(1);

      // Verify it's gone from source
      const sourceTasks = await todu.task.list({ projectId });
      expect(sourceTasks.ok).toBe(true);
      if (!sourceTasks.ok) return;
      expect(sourceTasks.value).toHaveLength(0);
    });

    it("rejects move to same project", async () => {
      const created = await todu.task.create({ title: "Stay", projectId });
      if (!created.ok) throw new Error("create failed");

      const result = await todu.task.move(created.value.id, projectId);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("validation");
    });

    it("returns NotFound for nonexistent target project", async () => {
      const created = await todu.task.create({ title: "Test", projectId });
      if (!created.ok) throw new Error("create failed");

      const result = await todu.task.move(created.value.id, createProjectId("proj-nope"));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("not-found");
    });

    it("returns NotFound for nonexistent task", async () => {
      const result = await todu.task.move(createTaskId("task-nope"), projectId);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("not-found");
    });
  });

  describe("search", () => {
    it("finds tasks by title substring", async () => {
      await todu.task.create({ title: "Fix login bug", projectId });
      await todu.task.create({ title: "Add signup flow", projectId });
      await todu.task.create({ title: "Fix logout bug", projectId });

      const result = await todu.task.search("fix");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(2);
    });

    it("search is case-insensitive", async () => {
      await todu.task.create({ title: "FIX CAPS", projectId });

      const result = await todu.task.search("fix");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(1);
    });

    it("returns empty for no matches", async () => {
      await todu.task.create({ title: "Something", projectId });

      const result = await todu.task.search("nonexistent");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(0);
    });

    it("searches across projects", async () => {
      const proj2 = await todu.project.create({ name: "Other" });
      if (!proj2.ok) throw new Error("create failed");

      await todu.task.create({ title: "Fix bug here", projectId });
      await todu.task.create({ title: "Fix bug there", projectId: proj2.value.id });

      const result = await todu.task.search("fix bug");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(2);
    });
  });

  describe("persistence", () => {
    it("tasks survive close and reopen", async () => {
      await todu.task.create({
        title: "Persistent",
        projectId,
        description: "Survives restart",
      });
      await todu.close();
      await new Promise((r) => setTimeout(r, 50));

      todu = await createTodu({ storagePath: tmpDir });
      const list = await todu.task.list();
      expect(list.ok).toBe(true);
      if (!list.ok) return;
      expect(list.value).toHaveLength(1);
      expect(list.value[0].title).toBe("Persistent");

      // Verify description loads too
      const detail = await todu.task.get(list.value[0].id);
      expect(detail.ok).toBe(true);
      if (!detail.ok) return;
      expect(detail.value.description).toBe("Survives restart");
    });
  });
});
