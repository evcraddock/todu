import { describe, expect, it } from "vitest";
import {
  createProjectListQuery,
  createTaskListQuery,
  defaultProjectListFilter,
  defaultTaskListFilter,
  formatProjectListFilter,
  formatTaskStatusFilter,
  matchesProjectListFilter,
  toggleStatus,
} from "./list-filter.js";
import { allProjectsFilter } from "./project-filter.js";

describe("list filters", () => {
  it("uses Open as the default task status package", () => {
    expect(formatTaskStatusFilter(defaultTaskListFilter.statuses)).toBe("Open");
    expect(createTaskListQuery(allProjectsFilter, defaultTaskListFilter)).toEqual({
      status: ["active", "inprogress", "waiting"],
    });
  });

  it("supports custom task status and priority filters", () => {
    expect(formatTaskStatusFilter(["active", "done"])).toBe("Active + Done");
    expect(
      createTaskListQuery(
        { projectId: "project-1", projectName: "Inbox" },
        { statuses: ["done"], priority: "high" },
      ),
    ).toEqual({ status: ["done"], priority: "high", projectId: "project-1" });
  });

  it("requires both a selected project status and the requested priority", () => {
    const filter = { statuses: ["active", "canceled"], priority: "medium" } as const;

    expect(matchesProjectListFilter({ status: "active", priority: "medium" }, filter)).toBe(true);
    expect(matchesProjectListFilter({ status: "canceled", priority: "medium" }, filter)).toBe(true);
    expect(matchesProjectListFilter({ status: "done", priority: "medium" }, filter)).toBe(false);
    expect(matchesProjectListFilter({ status: "active", priority: "high" }, filter)).toBe(false);
    expect(
      matchesProjectListFilter(
        { status: "active", priority: "high" },
        { ...filter, includeHigherPriorities: true },
      ),
    ).toBe(true);
    expect(
      matchesProjectListFilter(
        { status: "done", priority: "high" },
        { ...filter, includeHigherPriorities: true },
      ),
    ).toBe(false);
    expect(
      matchesProjectListFilter(
        { status: "active", priority: "low" },
        { ...filter, includeHigherPriorities: true },
      ),
    ).toBe(false);
  });

  it("matches all default statuses without a priority restriction", () => {
    for (const status of defaultProjectListFilter.statuses) {
      expect(matchesProjectListFilter({ status, priority: "low" }, defaultProjectListFilter)).toBe(
        true,
      );
    }
  });

  it("keeps at least one selected status", () => {
    expect(toggleStatus(["active"], "active")).toEqual(["active"]);
    expect(toggleStatus(["active"], "done")).toEqual(["active", "done"]);
  });

  it("creates project queries and summaries", () => {
    expect(createProjectListQuery(defaultProjectListFilter)).toEqual({
      status: ["active", "done", "canceled"],
    });
    expect(formatProjectListFilter({ statuses: ["active"], priority: "low" })).toBe(
      "Active · Low priority",
    );
  });
});
