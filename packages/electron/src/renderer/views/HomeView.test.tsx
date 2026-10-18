/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Project, Task } from "@todu/core/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeView } from "./HomeView.js";

const state = vi.hoisted(() => ({
  tasks: [] as Task[],
  projects: [] as Project[],
  projectsLoading: false,
  projectsError: null as Error | null,
  checkHabit: vi.fn(),
  uncheckHabit: vi.fn(),
}));

vi.mock("../hooks/useTodu.js", () => ({
  useTasks: ({ status }: { status: string }) => ({
    data: state.tasks.filter((task) => task.status === status),
  }),
  useProjects: () => ({
    data: state.projectsLoading ? undefined : state.projects,
    isLoading: state.projectsLoading,
    isError: !!state.projectsError,
    error: state.projectsError,
  }),
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
  state.projects = [makeProject("proj-1", { name: "Todu", priority: "medium" })];
  state.projectsLoading = false;
  state.projectsError = null;
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Home weekly planning", () => {
  it("shows scheduled work in This Week and preserves navigation, priority, and habits", () => {
    state.tasks = [
      makeTask("Later this week", { priority: "low", scheduledDate: "2026-10-17" }),
      makeTask("Earlier week", { scheduledDate: "2026-09-28" }),
      makeTask("Unscheduled high", { priority: "high" }),
      makeTask("Next week", { scheduledDate: "2026-10-18" }),
      makeTask("Waiting task", { status: "waiting", scheduledDate: "2026-10-12" }),
      makeTask("Completed task", { status: "done", scheduledDate: "2026-10-12" }),
      makeTask("Canceled task", { status: "canceled", scheduledDate: "2026-10-12" }),
    ];
    const onNavigateToTask = vi.fn();
    render(<HomeView onNavigateToTask={onNavigateToTask} onNavigateToProject={vi.fn()} />);

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

  it("opens the Sunday–Saturday plan on Sunday and retains unfinished earlier work", () => {
    vi.setSystemTime(new Date(2026, 9, 18, 12));
    state.tasks = [
      makeTask("Previous Saturday", { scheduledDate: "2026-10-17" }),
      makeTask("This Sunday", { scheduledDate: "2026-10-18" }),
      makeTask("This Monday", { scheduledDate: "2026-10-19" }),
      makeTask("This Saturday", { scheduledDate: "2026-10-24" }),
      makeTask("Next Sunday", { scheduledDate: "2026-10-25" }),
    ];
    render(<HomeView onNavigateToTask={vi.fn()} onNavigateToProject={vi.fn()} />);

    expect(screen.getByRole("heading", { name: /This Week/ }).textContent).toContain("4");
    for (const title of ["Previous Saturday", "This Sunday", "This Monday", "This Saturday"]) {
      expect(screen.getByRole("button", { name: new RegExp(title) })).toBeTruthy();
    }
    expect(screen.queryByRole("button", { name: /Next Sunday/ })).toBeNull();
  });

  it("preserves due-date section precedence without duplicating planned work", () => {
    state.tasks = [
      makeTask("Started", { status: "inprogress", scheduledDate: "2026-10-12" }),
      makeTask("Due today", { dueDate: "2026-10-14", scheduledDate: "2026-10-12" }),
      makeTask("Overdue", { dueDate: "2026-10-13", scheduledDate: "2026-10-12" }),
      makeTask("Coming soon", { dueDate: "2026-10-16", scheduledDate: "2026-10-12" }),
      makeTask("Weekly plan", { scheduledDate: "2026-10-17" }),
    ];
    render(<HomeView onNavigateToTask={vi.fn()} onNavigateToProject={vi.fn()} />);

    for (const task of state.tasks) {
      expect(screen.getAllByRole("button", { name: new RegExp(task.title) })).toHaveLength(1);
    }
    expect(screen.getByRole("heading", { name: /In Progress/ }).textContent).toContain("3");
    expect(screen.getByRole("heading", { name: /Coming Soon/ }).textContent).toContain("1");
    expect(screen.getByRole("heading", { name: /This Week/ }).textContent).toContain("1");
  });
});

function makeProject(id: string, overrides: Partial<Project> = {}): Project {
  return {
    id: id as Project["id"],
    name: id,
    status: "active",
    priority: "high",
    authorizedAssigneeActorIds: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...overrides,
  };
}

describe("Home project focus", () => {
  it("includes active high-priority projects even with no tasks and opens the selected project", () => {
    const focused = Object.freeze(makeProject("Empty focused project"));
    state.projects = [
      focused,
      makeProject("Low", { priority: "low" }),
      makeProject("Medium", { priority: "medium" }),
      makeProject("Done", { status: "done" }),
      makeProject("Canceled", { status: "canceled" }),
    ];
    const snapshot = structuredClone(state.projects);
    const onNavigateToProject = vi.fn();
    render(<HomeView onNavigateToTask={vi.fn()} onNavigateToProject={onNavigateToProject} />);

    expect(screen.getByRole("heading", { name: /Project Focus/ }).textContent).toContain("1");
    for (const name of ["Low", "Medium", "Done", "Canceled"]) {
      expect(screen.queryByRole("button", { name, exact: true })).toBeNull();
    }
    fireEvent.click(screen.getByRole("button", { name: "Empty focused project" }));
    expect(onNavigateToProject).toHaveBeenCalledWith(focused.id);
    expect(state.projects).toEqual(snapshot);
    expect(state.tasks).toEqual([]);
  });

  it("selects projects independently of task status, priority, and schedule", () => {
    state.projects = [makeProject("proj-1", { name: "Focused" })];
    state.tasks = [
      makeTask("Canceled work", {
        status: "canceled",
        priority: "low",
        scheduledDate: "2026-11-01",
      }),
    ];
    const taskSnapshot = structuredClone(state.tasks);
    render(<HomeView onNavigateToTask={vi.fn()} onNavigateToProject={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Focused" })).toBeTruthy();
    expect(state.tasks).toEqual(taskSnapshot);
  });

  it("updates membership when refreshed projects change priority or status", () => {
    state.projects = [makeProject("First"), makeProject("Second", { priority: "medium" })];
    const props = { onNavigateToTask: vi.fn(), onNavigateToProject: vi.fn() };
    const { rerender } = render(<HomeView {...props} />);
    expect(screen.getByRole("button", { name: "First" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Second" })).toBeNull();

    state.projects = [makeProject("First", { priority: "low" }), makeProject("Second")];
    rerender(<HomeView {...props} />);
    expect(screen.queryByRole("button", { name: "First" })).toBeNull();
    expect(screen.getByRole("button", { name: "Second" })).toBeTruthy();

    state.projects = [
      makeProject("First", { status: "done" }),
      makeProject("Second", { status: "canceled" }),
    ];
    rerender(<HomeView {...props} />);
    expect(screen.queryByRole("heading", { name: /Project Focus/ })).toBeNull();
  });

  it("hides the optional section when no projects qualify", () => {
    state.projects = [];
    render(<HomeView onNavigateToTask={vi.fn()} onNavigateToProject={vi.fn()} />);
    expect(screen.queryByRole("heading", { name: /Project Focus/ })).toBeNull();
  });

  it.each([
    "loading",
    "failure",
  ])("shows project %s without blocking tasks or habits", (condition) => {
    state.projectsLoading = condition === "loading";
    state.projectsError = condition === "failure" ? new Error("Daemon query failed") : null;
    state.tasks = [makeTask("Planned work", { scheduledDate: "2026-10-12" })];
    render(<HomeView onNavigateToTask={vi.fn()} onNavigateToProject={vi.fn()} />);
    expect(screen.getByRole("heading", { name: /Project Focus/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Planned work/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Today's Habits/ })).toBeTruthy();
    if (condition === "loading") {
      expect(screen.getByText("Loading projects…")).toBeTruthy();
    } else {
      expect(screen.getByRole("alert").textContent).toContain("Failed to load projects");
      expect(screen.getByRole("alert").textContent).toContain("Daemon query failed");
    }
  });
});
