import { describe, expect, it } from "vitest";
import { allProjectsFilter } from "./project-filter.js";
import { createOpenTaskFilter, formatTaskFilterSummary } from "./task-filter.js";

describe("task filter helpers", () => {
  it("creates the Open query filter without a priority restriction", () => {
    expect(createOpenTaskFilter({ projectFilter: allProjectsFilter })).toEqual({
      status: ["active", "inprogress", "waiting"],
    });
  });

  it.each([
    [undefined, "Any priority"],
    ["high", "High priority"],
    ["medium", "Medium priority"],
    ["low", "Low priority"],
  ] as const)("formats %s as %s", (priority, expectedLabel) => {
    expect(
      formatTaskFilterSummary({
        projectFilter: { projectId: null, projectName: "todu" },
        priority,
      }),
    ).toBe(`Open · ${expectedLabel} · todu`);
  });

  it("formats the default task filter", () => {
    expect(formatTaskFilterSummary({ projectFilter: allProjectsFilter })).toBe(
      "Open · Any priority · All Projects",
    );
  });
});
