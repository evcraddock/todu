/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";

vi.mock("./views/HomeView.js", () => ({
  HomeView: ({ onNavigateToProject }: { onNavigateToProject: (id: string) => void }) => (
    <>
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
vi.mock("./views/ProjectList.js", () => ({ ProjectList: () => <h2>Project list</h2> }));
vi.mock("./views/CreateProjectDialog.js", () => ({ CreateProjectDialog: () => null }));
vi.mock("./views/CreateTaskDialog.js", () => ({ CreateTaskDialog: () => null }));
vi.mock("./views/TaskDetail.js", () => ({ TaskDetail: () => null }));
vi.mock("./views/TasksView.js", () => ({ TasksView: () => null }));
vi.mock("./views/HabitsView.js", () => ({ HabitsView: () => null }));
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
        Home
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
    expect(screen.getByRole("heading", { name: "Project list" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    fireEvent.click(screen.getByRole("button", { name: "Projects" }));
    expect(screen.getByRole("heading", { name: "Project list" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    fireEvent.click(screen.getByRole("button", { name: "Focus B" }));
    expect(screen.getByRole("heading", { name: "Project detail: project-b" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    fireEvent.click(screen.getByRole("button", { name: "Focus B" }));
    expect(screen.getByRole("heading", { name: "Project detail: project-b" })).toBeTruthy();
  });
});
