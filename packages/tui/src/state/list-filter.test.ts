import { describe, expect, it } from "vitest";
import {
  createProjectListQuery,
  createTaskListQuery,
  defaultProjectListFilter,
  defaultTaskListFilter,
  formatProjectListFilter,
  formatTaskStatusFilter,
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
