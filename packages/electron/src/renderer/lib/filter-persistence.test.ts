/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_FILTER, loadFilter, saveFilter } from "./filter-persistence.js";

describe("filter-persistence", () => {
  afterEach(() => {
    localStorage.clear();
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
});
