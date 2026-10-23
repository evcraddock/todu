import { createActorId } from "@todu/core/browser";
import { expect, it } from "vitest";
import { matchesTaskAssignee } from "./task-assignee-filter.js";

it("matches stable IDs including tasks with several assignees", () => {
  const task = {
    assigneeActorIds: [createActorId("actor-a"), createActorId("actor-b")],
    assignees: [],
  };
  expect(matchesTaskAssignee(task, "actor-a")).toBe(true);
  expect(matchesTaskAssignee(task, "actor-b")).toBe(true);
  expect(matchesTaskAssignee(task, "actor-c")).toBe(false);
  expect(matchesTaskAssignee(task)).toBe(true);
});

it("distinguishes unassigned tasks from legacy name-only assignments", () => {
  expect(matchesTaskAssignee({ assigneeActorIds: [], assignees: [] }, "unassigned")).toBe(true);
  expect(matchesTaskAssignee({ assigneeActorIds: [], assignees: ["Reviewer"] }, "unassigned")).toBe(
    false,
  );
  expect(matchesTaskAssignee({ assigneeActorIds: [], assignees: ["Reviewer"] }, "actor-a")).toBe(
    false,
  );
});
