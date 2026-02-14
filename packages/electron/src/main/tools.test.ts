import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { TSchema } from "@sinclair/typebox";
import type { ProjectId } from "@todu/core";
import { createTodu } from "@todu/engine";
import type { Todu } from "@todu/engine";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createToduTools } from "./tools.js";

describe("todu agent tools", () => {
  let tmpDir: string;
  let todu: Todu;
  let tools: AgentTool<TSchema>[];
  let projectId: ProjectId;

  /** Find a tool by name. */
  function tool(name: string): AgentTool<TSchema> {
    const t = tools.find((t) => t.name === name);
    if (!t) throw new Error(`Tool not found: ${name}`);
    return t;
  }

  /** Execute a tool by name and return the result. */
  async function exec(name: string, params: Record<string, unknown> = {}) {
    const t = tool(name);
    return t.execute("test-call-id", params);
  }

  /** Execute and parse the JSON content from the result. */
  async function execJson(name: string, params: Record<string, unknown> = {}) {
    const result = await exec(name, params);
    const text = result.content[0];
    if (text.type !== "text") throw new Error("Expected text content");
    return JSON.parse(text.text);
  }

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-tools-test-"));
    todu = await createTodu({ storagePath: tmpDir });
    tools = createToduTools(todu);

    // Create a project for tests
    const result = await todu.project.create({ name: "Test Project" });
    if (!result.ok) throw new Error("Failed to create project");
    projectId = result.value.id;
  });

  afterEach(async () => {
    await todu.close();
    await new Promise((r) => setTimeout(r, 50));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── Tool registration ──────────────────────────────────────────────

  describe("createToduTools", () => {
    it("returns 19 tools", () => {
      expect(tools).toHaveLength(19);
    });

    it("every tool has required fields", () => {
      for (const t of tools) {
        expect(t.name).toBeTruthy();
        expect(t.description).toBeTruthy();
        expect(t.label).toBeTruthy();
        expect(t.parameters).toBeTruthy();
        expect(typeof t.execute).toBe("function");
      }
    });

    it("tool names are unique", () => {
      const names = tools.map((t) => t.name);
      expect(new Set(names).size).toBe(names.length);
    });
  });

  // ── Projects ───────────────────────────────────────────────────────

  describe("list_projects", () => {
    it("lists existing projects", async () => {
      const data = await execJson("list_projects");
      expect(data).toHaveLength(1);
      expect(data[0].name).toBe("Test Project");
    });

    it("filters by status", async () => {
      const data = await execJson("list_projects", { status: ["active"] });
      expect(data).toHaveLength(1);
      expect(data[0].name).toBe("Test Project");
    });

    it("filters by status with no matches", async () => {
      const data = await execJson("list_projects", { status: ["done"] });
      expect(data).toHaveLength(0);
    });

    it("filters by search", async () => {
      const data = await execJson("list_projects", { search: "Test" });
      expect(data).toHaveLength(1);
    });

    it("filters by search with no matches", async () => {
      const data = await execJson("list_projects", { search: "nonexistent" });
      expect(data).toHaveLength(0);
    });
  });

  describe("create_project", () => {
    it("creates a project", async () => {
      const data = await execJson("create_project", { name: "New Project" });
      expect(data.name).toBe("New Project");
      expect(data.id).toBeTruthy();
    });

    it("creates a project with priority", async () => {
      const data = await execJson("create_project", { name: "Urgent", priority: "high" });
      expect(data.priority).toBe("high");
    });
  });

  describe("update_project", () => {
    it("updates project name", async () => {
      const data = await execJson("update_project", { id: projectId, name: "Renamed" });
      expect(data.name).toBe("Renamed");
    });

    it("returns error for non-existent project", async () => {
      const result = await exec("update_project", { id: "nonexistent", name: "X" });
      const text = result.content[0];
      expect(text.type).toBe("text");
      if (text.type === "text") {
        expect(text.text).toContain("Not found");
      }
      expect(result.details).toEqual({ isError: true });
    });
  });

  // ── Tasks ──────────────────────────────────────────────────────────

  describe("create_task", () => {
    it("creates a task with required fields", async () => {
      const data = await execJson("create_task", { title: "Fix bug", projectId });
      expect(data.title).toBe("Fix bug");
      expect(data.status).toBe("active");
      expect(data.projectId).toBe(projectId);
    });

    it("creates a task with all optional fields", async () => {
      const data = await execJson("create_task", {
        title: "Full task",
        projectId,
        priority: "high",
        description: "A detailed description",
        labels: ["bug"],
        dueDate: "2026-12-01",
      });
      expect(data.priority).toBe("high");
      expect(data.description).toBe("A detailed description");
      expect(data.labels).toEqual(["bug"]);
    });
  });

  describe("list_tasks", () => {
    it("lists tasks in a project", async () => {
      await exec("create_task", { title: "Task 1", projectId });
      await exec("create_task", { title: "Task 2", projectId });
      const data = await execJson("list_tasks", { projectId });
      expect(data).toHaveLength(2);
    });

    it("filters by single status", async () => {
      await exec("create_task", { title: "Active", projectId });
      const data = await execJson("list_tasks", { status: ["done"] });
      expect(data).toHaveLength(0);
    });

    it("filters by multiple statuses", async () => {
      await exec("create_task", { title: "Task A", projectId });
      // Task A is active by default — update one to inprogress
      const created = await execJson("create_task", { title: "Task B", projectId });
      await exec("update_task", { id: created.id, status: "inprogress" });

      // Both active and inprogress should be returned
      const data = await execJson("list_tasks", { status: ["active", "inprogress"] });
      expect(data).toHaveLength(2);

      // Only inprogress
      const inProgress = await execJson("list_tasks", { status: ["inprogress"] });
      expect(inProgress).toHaveLength(1);
      expect(inProgress[0].title).toBe("Task B");
    });

    it("sorts by title", async () => {
      await exec("create_task", { title: "Bravo", projectId });
      await exec("create_task", { title: "Alpha", projectId });
      const data = await execJson("list_tasks", { sortField: "title", sortDirection: "asc" });
      expect(data[0].title).toBe("Alpha");
      expect(data[1].title).toBe("Bravo");
    });
  });

  describe("get_task", () => {
    it("returns task with description", async () => {
      const created = await execJson("create_task", {
        title: "Detailed",
        projectId,
        description: "Some details",
      });
      const data = await execJson("get_task", { id: created.id });
      expect(data.title).toBe("Detailed");
      expect(data.description).toBe("Some details");
    });

    it("returns error for non-existent task", async () => {
      const result = await exec("get_task", { id: "task-nonexistent" });
      expect(result.details).toEqual({ isError: true });
    });
  });

  describe("update_task", () => {
    it("updates task status", async () => {
      const created = await execJson("create_task", { title: "To do", projectId });
      const data = await execJson("update_task", { id: created.id, status: "done" });
      expect(data.status).toBe("done");
    });

    it("updates task priority", async () => {
      const created = await execJson("create_task", { title: "Low", projectId });
      const data = await execJson("update_task", { id: created.id, priority: "high" });
      expect(data.priority).toBe("high");
    });
  });

  describe("move_task", () => {
    it("moves a task to another project", async () => {
      const newProject = await execJson("create_project", { name: "Other" });
      const task = await execJson("create_task", { title: "Movable", projectId });
      const data = await execJson("move_task", { id: task.id, projectId: newProject.id });
      expect(data.projectId).toBe(newProject.id);
    });
  });

  describe("search_tasks", () => {
    it("finds tasks by title", async () => {
      await exec("create_task", { title: "Login bug fix", projectId });
      await exec("create_task", { title: "Dashboard redesign", projectId });
      const data = await execJson("search_tasks", { query: "login" });
      expect(data).toHaveLength(1);
      expect(data[0].title).toBe("Login bug fix");
    });

    it("returns empty for no matches", async () => {
      await exec("create_task", { title: "Something", projectId });
      const data = await execJson("search_tasks", { query: "nonexistent" });
      expect(data).toHaveLength(0);
    });
  });

  // ── Labels ─────────────────────────────────────────────────────────

  describe("list_labels", () => {
    it("returns empty initially", async () => {
      const data = await execJson("list_labels");
      expect(data).toHaveLength(0);
    });
  });

  describe("create_label", () => {
    it("creates a label", async () => {
      const data = await execJson("create_label", { name: "bug" });
      expect(data.name).toBe("bug");
      expect(data.id).toBeTruthy();
    });

    it("creates a label with color", async () => {
      const data = await execJson("create_label", { name: "urgent", color: "#ff0000" });
      expect(data.color).toBe("#ff0000");
    });

    it("label appears in list after creation", async () => {
      await exec("create_label", { name: "feature" });
      const data = await execJson("list_labels");
      expect(data).toHaveLength(1);
      expect(data[0].name).toBe("feature");
    });
  });

  // ── Habits ─────────────────────────────────────────────────────────

  describe("list_habits", () => {
    it("returns empty initially", async () => {
      const data = await execJson("list_habits");
      expect(data).toHaveLength(0);
    });
  });

  describe("check_habit / habit_streak / habit_history", () => {
    let habitId: string;

    beforeEach(async () => {
      const result = await todu.habit.create({
        title: "Exercise",
        schedule: "FREQ=DAILY;INTERVAL=1",
        timezone: "America/Chicago",
        startDate: "2026-01-01",
      });
      if (!result.ok) throw new Error("Failed to create habit");
      habitId = result.value.id;
    });

    it("checks in a habit", async () => {
      const data = await execJson("check_habit", { id: habitId });
      expect(data.completed).toBe(true);
    });

    it("gets streak info", async () => {
      await todu.habit.check(habitId);
      const data = await execJson("habit_streak", { id: habitId });
      expect(data.current).toBeGreaterThanOrEqual(1);
      expect(data.completedToday).toBe(true);
    });

    it("gets history", async () => {
      const data = await execJson("habit_history", { id: habitId, days: 7 });
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeLessThanOrEqual(7);
    });

    it("lists habits with filter", async () => {
      const data = await execJson("list_habits", { paused: false });
      expect(data).toHaveLength(1);
      expect(data[0].title).toBe("Exercise");
    });
  });

  // ── Recurring ──────────────────────────────────────────────────────

  describe("list_recurring", () => {
    it("returns empty initially", async () => {
      const data = await execJson("list_recurring");
      expect(data).toHaveLength(0);
    });
  });

  describe("recurring_upcoming", () => {
    it("returns upcoming occurrences", async () => {
      await todu.recurring.create({
        title: "Weekly review",
        schedule: "FREQ=WEEKLY;BYDAY=FR",
        timezone: "America/Chicago",
        startDate: "2026-01-01",
        projectId,
      });
      const data = await execJson("recurring_upcoming", { days: 14 });
      expect(Array.isArray(data)).toBe(true);
    });

    it("lists recurring templates", async () => {
      await todu.recurring.create({
        title: "Daily standup",
        schedule: "FREQ=DAILY;INTERVAL=1",
        timezone: "America/Chicago",
        startDate: "2026-01-01",
        projectId,
      });
      const data = await execJson("list_recurring");
      expect(data).toHaveLength(1);
      expect(data[0].title).toBe("Daily standup");
    });
  });

  // ── Notes ──────────────────────────────────────────────────────────

  describe("list_notes", () => {
    it("returns empty initially", async () => {
      const data = await execJson("list_notes");
      expect(data).toHaveLength(0);
    });
  });

  describe("create_note", () => {
    it("creates a standalone note", async () => {
      const data = await execJson("create_note", { content: "A thought" });
      expect(data.content).toBe("A thought");
      expect(data.id).toBeTruthy();
    });

    it("creates a note attached to a task", async () => {
      const task = await execJson("create_task", { title: "Noted task", projectId });
      const data = await execJson("create_note", {
        content: "Note on task",
        entityType: "task",
        entityId: task.id,
      });
      expect(data.entityType).toBe("task");
      expect(data.entityId).toBe(task.id);
    });

    it("note appears in filtered list", async () => {
      const task = await execJson("create_task", { title: "T", projectId });
      await exec("create_note", { content: "Note 1", entityType: "task", entityId: task.id });
      await exec("create_note", { content: "Note 2" });

      const all = await execJson("list_notes");
      expect(all).toHaveLength(2);

      const filtered = await execJson("list_notes", { entityType: "task", entityId: task.id });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].content).toBe("Note 1");
    });
  });

  // ── Error handling ─────────────────────────────────────────────────

  describe("error handling", () => {
    it("returns error content for not-found", async () => {
      const result = await exec("get_task", { id: "task-does-not-exist" });
      const text = result.content[0];
      expect(text.type).toBe("text");
      if (text.type === "text") {
        expect(text.text).toContain("Not found");
      }
      expect(result.details).toEqual({ isError: true });
    });

    it("returns error content for invalid update", async () => {
      const result = await exec("update_project", { id: "proj-nope", status: "done" });
      const text = result.content[0];
      expect(text.type).toBe("text");
      if (text.type === "text") {
        expect(text.text).toMatch(/Not found|error/i);
      }
      expect(result.details).toEqual({ isError: true });
    });
  });

  // ── UI Action emission ──────────────────────────────────────────────

  describe("ui-action emission", () => {
    it("list_tasks emits show_tasks ui-action with filter", async () => {
      const sentMessages: Array<{ channel: string; data: unknown }> = [];
      const mockWindow = {
        isDestroyed: () => false,
        webContents: {
          send: (channel: string, data: unknown) => {
            sentMessages.push({ channel, data });
          },
        },
      };

      const toolsWithWindow = createToduTools(
        todu,
        mockWindow as unknown as import("electron").BrowserWindow,
      );
      const listTasks = toolsWithWindow.find((t) => t.name === "list_tasks")!;

      await listTasks.execute("test-call", { priority: "high", status: ["active"] });

      const uiActions = sentMessages.filter((m) => m.channel === "todu:ui-action");
      expect(uiActions).toHaveLength(1);
      expect(uiActions[0].data).toEqual({
        action: "show_tasks",
        filter: { priority: "high", status: ["active"] },
      });
    });

    it("list_tasks emits filter without sort fields", async () => {
      const sentMessages: Array<{ channel: string; data: unknown }> = [];
      const mockWindow = {
        isDestroyed: () => false,
        webContents: {
          send: (channel: string, data: unknown) => {
            sentMessages.push({ channel, data });
          },
        },
      };

      const toolsWithWindow = createToduTools(
        todu,
        mockWindow as unknown as import("electron").BrowserWindow,
      );
      const listTasks = toolsWithWindow.find((t) => t.name === "list_tasks")!;

      await listTasks.execute("test-call", {
        priority: "high",
        sortField: "title",
        sortDirection: "asc",
      });

      const uiActions = sentMessages.filter((m) => m.channel === "todu:ui-action");
      expect(uiActions).toHaveLength(1);
      // Filter should NOT include sortField/sortDirection
      expect(uiActions[0].data).toEqual({
        action: "show_tasks",
        filter: { priority: "high" },
      });
    });

    it("list_tasks does not emit when no mainWindow provided", async () => {
      // The default tools (no mainWindow) should not throw
      const listTasks = tools.find((t) => t.name === "list_tasks")!;
      const result = await listTasks.execute("test-call", {});
      expect(result.content[0].type).toBe("text");
    });

    it("list_projects emits show_projects ui-action with filter", async () => {
      const sentMessages: Array<{ channel: string; data: unknown }> = [];
      const mockWindow = {
        isDestroyed: () => false,
        webContents: {
          send: (channel: string, data: unknown) => {
            sentMessages.push({ channel, data });
          },
        },
      };

      const toolsWithWindow = createToduTools(
        todu,
        mockWindow as unknown as import("electron").BrowserWindow,
      );
      const listProjects = toolsWithWindow.find((t) => t.name === "list_projects")!;

      await listProjects.execute("test-call", { status: ["active"], priority: "high" });

      const uiActions = sentMessages.filter((m) => m.channel === "todu:ui-action");
      expect(uiActions).toHaveLength(1);
      expect(uiActions[0].data).toEqual({
        action: "show_projects",
        filter: { status: ["active"], priority: "high" },
      });
    });

    it("list_projects emits empty filter when called without params", async () => {
      const sentMessages: Array<{ channel: string; data: unknown }> = [];
      const mockWindow = {
        isDestroyed: () => false,
        webContents: {
          send: (channel: string, data: unknown) => {
            sentMessages.push({ channel, data });
          },
        },
      };

      const toolsWithWindow = createToduTools(
        todu,
        mockWindow as unknown as import("electron").BrowserWindow,
      );
      const listProjects = toolsWithWindow.find((t) => t.name === "list_projects")!;

      await listProjects.execute("test-call", {});

      const uiActions = sentMessages.filter((m) => m.channel === "todu:ui-action");
      expect(uiActions).toHaveLength(1);
      expect(uiActions[0].data).toEqual({
        action: "show_projects",
        filter: {},
      });
    });
  });
});
