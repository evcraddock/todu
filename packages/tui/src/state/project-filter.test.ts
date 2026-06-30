import { describe, expect, it } from "vitest";
import { allProjectsFilter, createProjectFilter, describeProjectFilter } from "./project-filter.js";

const project = {
  id: "project-1",
  name: "Inbox",
  status: "active",
  priority: "medium",
  authorizedAssigneeActorIds: [],
  createdAt: "2026-06-30T00:00:00.000Z",
  updatedAt: "2026-06-30T00:00:00.000Z",
} as const;

describe("project filter helpers", () => {
  it("describes all projects", () => {
    expect(describeProjectFilter(allProjectsFilter)).toBe("All projects");
  });

  it("creates and describes selected project filters", () => {
    const filter = createProjectFilter(project);

    expect(filter).toEqual({ projectId: "project-1", projectName: "Inbox" });
    expect(describeProjectFilter(filter)).toBe("Inbox");
  });
});
