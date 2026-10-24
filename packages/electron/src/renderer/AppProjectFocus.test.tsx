/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";

vi.mock("./views/HomeView.js", () => ({
  HomeView: ({
    onNavigateToProject,
    onNavigateToHabit,
    onNavigateToTask,
  }: {
    onNavigateToProject: (id: string) => void;
    onNavigateToHabit: (id: string) => void;
    onNavigateToTask: (id: string) => void;
  }) => (
    <>
      <button type="button" onClick={() => onNavigateToTask("task-a")}>
        Open home task
      </button>
      <button type="button" onClick={() => onNavigateToHabit("habit-a")}>
        Open home habit
      </button>
      <button type="button" onClick={() => onNavigateToProject("project-a")}>
        Focus A
      </button>
      <button type="button" onClick={() => onNavigateToProject("project-b")}>
        Focus B
      </button>
    </>
  ),
}));
vi.mock("./views/ProjectDetail.js", () => ({
  ProjectDetail: ({ projectId, onBack }: { projectId: string; onBack: () => void }) => (
    <>
      <h2>Project detail: {projectId}</h2>
      <button type="button" onClick={onBack}>
        Back to project list
      </button>
    </>
  ),
}));
vi.mock("./views/ProjectList.js", () => ({
  ProjectList: ({ onSelectProject }: { onSelectProject: (id: string) => void }) => (
    <>
      <h2>Project list</h2>
      <button type="button" onClick={() => onSelectProject("project-c")}>
        Open list project
      </button>
    </>
  ),
}));
vi.mock("./views/CreateProjectDialog.js", () => ({ CreateProjectDialog: () => null }));
vi.mock("./views/CreateTaskDialog.js", () => ({ CreateTaskDialog: () => null }));
vi.mock("./views/TaskDetail.js", () => ({
  TaskDetail: ({ taskId, onBack }: { taskId: string; onBack: () => void }) => (
    <>
      <h2>Task detail: {taskId}</h2>
      <button type="button" onClick={onBack}>
        Back from task
      </button>
    </>
  ),
}));
vi.mock("./views/TaskList.js", () => ({
  TaskList: ({ onSelectTask }: { onSelectTask: (id: string) => void }) => (
    <>
      <h2>Task list</h2>
      <button type="button" onClick={() => onSelectTask("task-b")}>
        Open list task
      </button>
    </>
  ),
}));
vi.mock("./views/HabitDetail.js", () => ({
  HabitDetail: ({ habitId, onBack }: { habitId: string; onBack: () => void }) => (
    <>
      <h2>Habit detail: {habitId}</h2>
      <button type="button" onClick={onBack}>
        Back from habit
      </button>
    </>
  ),
}));
vi.mock("./views/HabitList.js", () => ({
  HabitList: ({ onSelectHabit }: { onSelectHabit: (id: string) => void }) => (
    <>
      <h2>Habit list</h2>
      <button type="button" onClick={() => onSelectHabit("habit-b")}>
        Open list habit
      </button>
    </>
  ),
}));
vi.mock("./views/CreateHabitDialog.js", () => ({ CreateHabitDialog: () => null }));
vi.mock("./views/JournalView.js", () => ({ JournalView: () => null }));
vi.mock("./views/LabelsView.js", () => ({ LabelsView: () => null }));
vi.mock("./views/RecurringView.js", () => ({ RecurringView: () => null }));
vi.mock("./views/SettingsView.js", () => ({ SettingsView: () => null }));
vi.mock("./components/AgentPane.js", () => ({ AgentPane: () => null }));
vi.mock("./components/StatusBar.js", () => ({ StatusBar: () => null }));
vi.mock("./components/ToastContainer.js", () => ({
  ToastContainer: () => null,
  showToast: vi.fn(),
}));
vi.mock("./components/Sidebar.js", () => ({
  Sidebar: ({ onNavigate }: { onNavigate: (view: string) => void }) => (
    <>
      <button type="button" onClick={() => onNavigate("home")}>
        Overview
      </button>
      <button type="button" onClick={() => onNavigate("habits")}>
        Habits
      </button>
      <button type="button" onClick={() => onNavigate("tasks")}>
        Tasks
      </button>
      <button type="button" onClick={() => onNavigate("projects")}>
        Projects
      </button>
    </>
  ),
}));
vi.mock("./hooks/useTheme.js", () => ({
  useTheme: () => ({ preference: "system", setPreference: vi.fn() }),
}));
vi.mock("./hooks/useSidebar.js", () => ({ useSidebar: () => ({ toggleHidden: vi.fn() }) }));
vi.mock("./hooks/useAgentPane.js", () => ({ useAgentPane: () => ({ toggle: vi.fn() }) }));

beforeEach(() => {
  Object.defineProperty(window, "todu", {
    configurable: true,
    value: { on: vi.fn(() => vi.fn()) },
  });
});

afterEach(cleanup);

describe("Project Focus navigation", () => {
  it("opens the chosen project detail, supports Back, and consumes the request", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Focus A" }));
    expect(screen.getByRole("heading", { name: "Project detail: project-a" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Back to project list" }));
    expect(screen.getByRole("button", { name: "Focus A" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Overview" }));
    fireEvent.click(screen.getByRole("button", { name: "Projects" }));
    expect(screen.getByRole("heading", { name: "Project list" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Overview" }));
    fireEvent.click(screen.getByRole("button", { name: "Focus B" }));
    expect(screen.getByRole("heading", { name: "Project detail: project-b" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Overview" }));
    fireEvent.click(screen.getByRole("button", { name: "Focus B" }));
    expect(screen.getByRole("heading", { name: "Project detail: project-b" })).toBeTruthy();
  });
});

it("returns a Overview habit to Overview and a list habit to the habits list", () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Open home habit" }));
  expect(screen.getByRole("heading", { name: "Habit detail: habit-a" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Back from habit" }));
  expect(screen.getByRole("button", { name: "Open home habit" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Habits" }));
  expect(screen.getByRole("heading", { name: "Habit list" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Open list habit" }));
  fireEvent.click(screen.getByRole("button", { name: "Back from habit" }));
  expect(screen.getByRole("heading", { name: "Habit list" })).toBeTruthy();
});

it("returns projects opened from the projects list to that list", () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Projects" }));
  fireEvent.click(screen.getByRole("button", { name: "Open list project" }));
  fireEvent.click(screen.getByRole("button", { name: "Back to project list" }));
  expect(screen.getByRole("heading", { name: "Project list" })).toBeTruthy();
});

it("returns a Overview task to Overview and a list task to the task list", () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Open home task" }));
  expect(screen.getByRole("heading", { name: "Task detail: task-a" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Back from task" }));
  expect(screen.getByRole("button", { name: "Open home task" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Tasks" }));
  expect(screen.getByRole("heading", { name: "Task list" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Open list task" }));
  fireEvent.click(screen.getByRole("button", { name: "Back from task" }));
  expect(screen.getByRole("heading", { name: "Task list" })).toBeTruthy();
});
