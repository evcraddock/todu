/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Task } from "@todu/core/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeView } from "./HomeView.js";

const state = vi.hoisted(() => ({
  tasks: [] as Task[],
  checkHabit: vi.fn(),
  uncheckHabit: vi.fn(),
}));

vi.mock("../hooks/useTodu.js", () => ({
  useTasks: ({ status }: { status: string }) => ({
    data: state.tasks.filter((task) => task.status === status),
  }),
  useProjects: () => ({ data: [{ id: "proj-1", name: "Todu" }] }),
  useHabitList: () => ({ data: [{ id: "habit-1", title: "Daily habit" }] }),
  useHabitStreak: () => ({ data: { completedToday: false, current: 2 } }),
  useCheckHabit: () => ({ mutate: state.checkHabit, isPending: false }),
  useUncheckHabit: () => ({ mutate: state.uncheckHabit, isPending: false }),
}));

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id: id as Task["id"],
    title: id,
    projectId: "proj-1" as Task["projectId"],
    status: "active",
    priority: "medium",
    labels: [],
    assigneeActorIds: [],
    assignees: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 14, 12));
  state.tasks = [];
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Home weekly planning", () => {
  it("shows scheduled work in This Week and preserves navigation, priority, and habits", () => {
    state.tasks = [
      makeTask("Later this week", { priority: "low", scheduledDate: "2026-10-18" }),
      makeTask("Earlier week", { scheduledDate: "2026-09-28" }),
      makeTask("Unscheduled high", { priority: "high" }),
      makeTask("Next week", { scheduledDate: "2026-10-19" }),
      makeTask("Waiting task", { status: "waiting", scheduledDate: "2026-10-12" }),
      makeTask("Completed task", { status: "done", scheduledDate: "2026-10-12" }),
      makeTask("Canceled task", { status: "canceled", scheduledDate: "2026-10-12" }),
    ];
    const onNavigateToTask = vi.fn();
    render(<HomeView onNavigateToTask={onNavigateToTask} />);

    expect(screen.getByRole("heading", { name: /This Week/ })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /Next/ })).toBeNull();
    const scheduledTask = screen.getByRole("button", { name: /Later this week/ });
    expect(scheduledTask.textContent).toContain("low");
    expect(scheduledTask.textContent).toContain("Todu");
    expect(screen.getByRole("button", { name: /Earlier week/ }).textContent).not.toContain(
      "overdue",
    );
    for (const title of ["Unscheduled high", "Next week", "Completed task", "Canceled task"]) {
      expect(screen.queryByRole("button", { name: new RegExp(title) })).toBeNull();
    }
    fireEvent.click(scheduledTask);
    expect(onNavigateToTask).toHaveBeenCalledWith("Later this week");
    expect(screen.getByRole("heading", { name: /Waiting/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Today's Habits/ })).toBeTruthy();
    fireEvent.click(screen.getByTitle("Check in today"));
    expect(state.checkHabit).toHaveBeenCalledWith("habit-1");
  });

  it("preserves due-date section precedence without duplicating planned work", () => {
    state.tasks = [
      makeTask("Started", { status: "inprogress", scheduledDate: "2026-10-12" }),
      makeTask("Due today", { dueDate: "2026-10-14", scheduledDate: "2026-10-12" }),
      makeTask("Overdue", { dueDate: "2026-10-13", scheduledDate: "2026-10-12" }),
      makeTask("Coming soon", { dueDate: "2026-10-16", scheduledDate: "2026-10-12" }),
      makeTask("Weekly plan", { scheduledDate: "2026-10-18" }),
    ];
    render(<HomeView onNavigateToTask={vi.fn()} />);

    for (const task of state.tasks) {
      expect(screen.getAllByRole("button", { name: new RegExp(task.title) })).toHaveLength(1);
    }
    expect(screen.getByRole("heading", { name: /In Progress/ }).textContent).toContain("3");
    expect(screen.getByRole("heading", { name: /Coming Soon/ }).textContent).toContain("1");
    expect(screen.getByRole("heading", { name: /This Week/ }).textContent).toContain("1");
  });
});
