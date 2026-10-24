/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_FILTER,
  loadFilter,
  loadProjectFilter,
  loadTaskSort,
  saveFilter,
  saveProjectFilter,
  saveTaskSort,
} from "./filter-persistence.js";

describe("filter-persistence", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("remembers project status and priority without persisting search text", () => {
    expect(loadProjectFilter()).toEqual({ status: "active" });
    saveProjectFilter({ status: "done", priority: "high", search: "temporary" });
    expect(loadProjectFilter()).toEqual({ status: "done", priority: "high" });
    saveProjectFilter({});
    expect(loadProjectFilter()).toEqual({});
    localStorage.setItem("todu:list:projects:filter", '{"status":"invalid"}');
    expect(loadProjectFilter()).toEqual({ status: "active" });
  });

  describe("loadFilter", () => {
    it("returns default filter when nothing is stored", () => {
      expect(loadFilter()).toEqual({ ...DEFAULT_FILTER, activeProjects: true });
    });

    it("preserves a specific project and an explicit All projects selection", () => {
      saveFilter({ projectId: "proj-1" as never });
      expect(loadFilter().activeProjects).toBe(false);
      saveFilter({ activeProjects: false });
      expect(loadFilter().activeProjects).toBe(false);
    });

    it("returns stored filter", () => {
      const filter = { status: ["done" as const], priority: "high" as const };
      localStorage.setItem("todu:task-filter", JSON.stringify(filter));
      expect(loadFilter()).toEqual({ ...filter, activeProjects: true });
    });

    it("returns default filter on corrupt JSON", () => {
      localStorage.setItem("todu:task-filter", "not-json{{{");
      expect(loadFilter()).toEqual({ ...DEFAULT_FILTER, activeProjects: true });
    });

    it("returns default filter on non-object JSON", () => {
      localStorage.setItem("todu:task-filter", '"string"');
      expect(loadFilter()).toEqual({ ...DEFAULT_FILTER, activeProjects: true });
    });
  });

  describe("saveFilter", () => {
    it("persists filter to localStorage", () => {
      const filter = { status: ["waiting" as const], overdue: true };
      saveFilter(filter);
      const raw = localStorage.getItem("todu:task-filter");
      expect(JSON.parse(raw!)).toEqual(filter);
    });

    it("does not throw when storage is unavailable", () => {
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });
      expect(() => saveFilter({ status: ["active"] })).not.toThrow();
      vi.restoreAllMocks();
    });
  });

  describe("DEFAULT_FILTER", () => {
    it("includes all unfinished statuses", () => {
      expect(DEFAULT_FILTER.status).toEqual(["active", "inprogress", "waiting"]);
    });
  });

  it("restores all task filter selections together", () => {
    const filter = {
      projectId: "proj-1" as never,
      activeProjects: false,
      status: "waiting" as const,
      priority: "high" as const,
      assignee: "actor-user",
      today: true,
    };
    saveFilter(filter);
    expect(loadFilter()).toEqual(filter);
  });

  it("remembers the selected sort and a return to default ordering", () => {
    expect(loadTaskSort()).toBeUndefined();
    saveTaskSort({ field: "title", direction: "asc" });
    expect(loadTaskSort()).toEqual({ field: "title", direction: "asc" });
    saveTaskSort(undefined);
    expect(loadTaskSort()).toBeUndefined();
  });

  it.each([
    "not-json",
    "null",
    '{"field":"invalid","direction":"asc"}',
    '{"field":"title","direction":"invalid"}',
  ])("falls back to default ordering for invalid saved sort %s", (raw) => {
    localStorage.setItem("todu:task-sort", raw);
    expect(loadTaskSort()).toBeUndefined();
  });
});
