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
      expect(loadFilter()).toEqual(DEFAULT_FILTER);
    });

    it("returns stored filter", () => {
      const filter = { status: ["done" as const], priority: "high" as const };
      localStorage.setItem("todu:task-filter", JSON.stringify(filter));
      expect(loadFilter()).toEqual(filter);
    });

    it("returns default filter on corrupt JSON", () => {
      localStorage.setItem("todu:task-filter", "not-json{{{");
      expect(loadFilter()).toEqual(DEFAULT_FILTER);
    });

    it("returns default filter on non-object JSON", () => {
      localStorage.setItem("todu:task-filter", '"string"');
      expect(loadFilter()).toEqual(DEFAULT_FILTER);
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
    it("has active and inprogress statuses", () => {
      expect(DEFAULT_FILTER.status).toEqual(["active", "inprogress"]);
    });
  });
});
