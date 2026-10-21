import type { Project, Task } from "@todu/core";
import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  createHomeProjectFocus,
  createHomeTaskSections,
  endOfWeek,
  localDateString,
} from "./home-sections.js";

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

  it("includes only active high-priority projects, preserving order and project fields", () => {
    const projects = (["active", "done", "canceled"] as const).flatMap((status) =>
      (["low", "medium", "high"] as const).map((priority) =>
        Object.freeze({
          id: `${status}-${priority}` as Project["id"],
          name: `${status} ${priority}`,
          status,
          priority,
          authorizedAssigneeActorIds: [],
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
        }),
      ),
    );
    const snapshot = structuredClone(projects);
    const focused = createHomeProjectFocus(Object.freeze(projects));

    expect(focused.map((project) => project.id)).toEqual(["active-high"]);
    expect(focused[0]).toBe(projects[2]);
    expect(projects).toEqual(snapshot);
    expect(createHomeProjectFocus([])).toEqual([]);
  });

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

  it.each([
    ["2026-07-19", "2026-07-25"],
    ["2026-07-25", "2026-07-25"],
    ["2026-07-26", "2026-08-01"],
    ["2026-01-31", "2026-01-31"],
    ["2026-02-01", "2026-02-07"],
    ["2026-12-31", "2027-01-02"],
    ["2027-01-01", "2027-01-02"],
    ["2027-01-03", "2027-01-09"],
    ["2028-02-29", "2028-03-04"],
  ])("ends the local Sunday-first week containing %s on %s", (date, expectedEnd) => {
    expect(endOfWeek(date)).toBe(expectedEnd);
  });

  it("includes every priority scheduled earlier or anywhere this week, including later days", () => {
    const tasks = (["low", "medium", "high"] as const).flatMap((priority) =>
      ["2025-01-05", "2026-07-18", "2026-07-19", today, "2026-07-24", "2026-07-25"].map(
        (scheduledDate) =>
          createTask({
            id: `${priority}-${scheduledDate}` as Task["id"],
            priority,
            scheduledDate,
          }),
      ),
    );
    const sections = createHomeTaskSections(tasks, today);

    expect(sections.thisWeek).toEqual(tasks);
    expect(sections.now).toEqual([]);
    expect(sections.waiting).toEqual([]);
  });

  it("does not admit unscheduled or future-week tasks based on high priority or due dates", () => {
    const sections = createHomeTaskSections(
      [
        createTask({ priority: "high" }),
        createTask({ priority: "high", scheduledDate: "2026-07-26" }),
        createTask({ dueDate: "2026-07-22" }),
        createTask({ priority: "high", dueDate: "2026-07-22", scheduledDate: "2026-07-26" }),
        createTask({ priority: "high", dueDate: "2026-07-19" }),
      ],
      today,
    );

    expect(sections.thisWeek).toEqual([]);
  });

  it.each([
    "2026-07-25",
    "2026-07-26",
    "2026-08-02",
    "2027-01-03",
  ])("keeps an unfinished task from an earlier week visible on %s without rescheduling", (date) => {
    const task = Object.freeze(createTask({ priority: "low", scheduledDate: "2026-07-19" }));
    const sections = createHomeTaskSections([task], date);

    expect(sections.thisWeek).toEqual([task]);
    expect(sections.thisWeek[0]).toBe(task);
    expect(task.scheduledDate).toBe("2026-07-19");
  });

  it.each([
    "waiting",
    "done",
    "canceled",
    "inprogress",
  ] as const)("does not include a %s task in This Week even with an earlier scheduled date", (status) => {
    const task = createTask({ status, priority: "high", scheduledDate: "2026-07-12" });
    const sections = createHomeTaskSections([task], today);

    expect(sections.thisWeek).toEqual([]);
    expect(sections.now).toEqual(status === "inprogress" ? [task] : []);
    expect(sections.waiting).toEqual(status === "waiting" ? [task] : []);
  });

  it("preserves fields and input order without mutating tasks or marking carryover overdue", () => {
    const tasks = [
      createTask({ id: "no-deadline" as Task["id"], priority: "low", scheduledDate: "2026-07-12" }),
      createTask({
        id: "past-deadline" as Task["id"],
        dueDate: "2026-07-19",
        scheduledDate: "2026-07-19",
      }),
      createTask({
        id: "future-deadline" as Task["id"],
        priority: "high",
        dueDate: "2026-08-01",
        scheduledDate: "2026-07-25T18:30:00.000Z",
      }),
    ];
    const snapshot = structuredClone(tasks);
    tasks.forEach(Object.freeze);
    const sections = createHomeTaskSections(Object.freeze(tasks), today);

    expect(sections.thisWeek).toEqual(snapshot);
    expect(sections.thisWeek.every((task, index) => task === tasks[index])).toBe(true);
    expect(tasks).toEqual(snapshot);
  });

  it("puts waiting tasks in Waiting", () => {
    const sections = createHomeTaskSections(
      [createTask({ id: "task-waiting" as Task["id"], status: "waiting", priority: "high" })],
      today,
    );

    expect(sections.waiting.map((task) => task.id)).toEqual(["task-waiting"]);
  });

  it("uses Now before This Week without duplicating scheduled tasks", () => {
    const sections = createHomeTaskSections(
      [
        createTask({
          id: "task-overlap" as Task["id"],
          status: "inprogress",
          priority: "high",
          dueDate: today,
          scheduledDate: "2026-07-19",
        }),
        createTask({
          id: "active-today" as Task["id"],
          dueDate: today,
          scheduledDate: "2026-07-25",
        }),
      ],
      today,
    );

    expect(sections.now).toHaveLength(2);
    expect(sections.thisWeek).toHaveLength(0);
  });
});
