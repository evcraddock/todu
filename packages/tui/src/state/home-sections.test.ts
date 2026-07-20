import type { Task } from "@todu/core";
import { describe, expect, it } from "vitest";
import { addCalendarDays, createHomeTaskSections, localDateString } from "./home-sections.js";

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1" as Task["id"],
    title: "Task",
    status: "active",
    priority: "medium",
    projectId: "project-1" as Task["projectId"],
    labels: [],
    assigneeActorIds: [],
    assignees: [],
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("home sections", () => {
  const today = "2026-07-20";

  it("formats local dates and adds calendar days", () => {
    expect(localDateString(new Date(2026, 6, 20, 12))).toBe(today);
    expect(addCalendarDays("2026-07-30", 2)).toBe("2026-08-01");
  });

  it("puts in-progress and due-today active tasks in Now", () => {
    const sections = createHomeTaskSections(
      [
        createTask({ id: "task-progress" as Task["id"], status: "inprogress" }),
        createTask({ id: "task-today" as Task["id"], dueDate: today }),
      ],
      today,
    );

    expect(sections.now.map((task) => task.id)).toEqual(["task-progress", "task-today"]);
  });

  it("puts high-priority and exactly two-days-out active tasks in Next", () => {
    const sections = createHomeTaskSections(
      [
        createTask({ id: "task-high" as Task["id"], priority: "high" }),
        createTask({ id: "task-two-days" as Task["id"], dueDate: "2026-07-22" }),
        createTask({ id: "task-tomorrow" as Task["id"], dueDate: "2026-07-21" }),
        createTask({ id: "task-three-days" as Task["id"], dueDate: "2026-07-23" }),
      ],
      today,
    );

    expect(sections.next.map((task) => task.id)).toEqual(["task-high", "task-two-days"]);
  });

  it("puts waiting tasks in Waiting", () => {
    const sections = createHomeTaskSections(
      [createTask({ id: "task-waiting" as Task["id"], status: "waiting", priority: "high" })],
      today,
    );

    expect(sections.waiting.map((task) => task.id)).toEqual(["task-waiting"]);
  });

  it("uses Now before Next when a task matches both", () => {
    const sections = createHomeTaskSections(
      [
        createTask({
          id: "task-overlap" as Task["id"],
          status: "inprogress",
          priority: "high",
          dueDate: today,
        }),
      ],
      today,
    );

    expect(sections.now).toHaveLength(1);
    expect(sections.next).toHaveLength(0);
  });
});
