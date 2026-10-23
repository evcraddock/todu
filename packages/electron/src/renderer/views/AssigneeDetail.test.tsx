/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Project, ProjectFilter, Task, TaskFilter } from "@todu/core/browser";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as hooks from "../hooks/useTodu.js";
import { AssigneeDetail } from "./AssigneeDetail.js";

vi.mock("../hooks/useTodu.js", () => ({
  useActors: vi.fn(),
  useProjects: vi.fn(),
  useTasks: vi.fn(),
}));
vi.mock("./ProjectDetail.js", () => ({
  ProjectDetail: ({ projectId, onBack }: { projectId: string; onBack: () => void }) => (
    <>
      <h2>Project: {projectId}</h2>
      <button type="button" onClick={onBack}>
        Return to assignee
      </button>
    </>
  ),
}));
vi.mock("./TaskDetail.js", () => ({
  TaskDetail: ({ taskId, onBack }: { taskId: string; onBack: () => void }) => (
    <>
      <h2>Task: {taskId}</h2>
      <button type="button" onClick={onBack}>
        Return to assignee
      </button>
    </>
  ),
}));
vi.mock("./CreateTaskDialog.js", () => ({ CreateTaskDialog: () => null }));
const projects = [
  {
    id: "proj-a",
    name: "Authorized project",
    status: "active",
    priority: "medium",
    authorizedAssigneeActorIds: ["actor-a"],
  },
  {
    id: "proj-b",
    name: "Other project",
    status: "active",
    priority: "high",
    authorizedAssigneeActorIds: ["actor-b"],
  },
  {
    id: "proj-done",
    name: "Completed project",
    status: "done",
    priority: "low",
    authorizedAssigneeActorIds: ["actor-a"],
  },
] as Project[];
const taskBase = {
  status: "active",
  priority: "medium",
  labels: [],
  assignees: [],
  createdAt: "2026-10-23",
  updatedAt: "2026-10-23",
};
const tasks = [
  {
    ...taskBase,
    id: "task-a",
    title: "Assigned task",
    projectId: "proj-a",
    assigneeActorIds: ["actor-a"],
  },
  {
    ...taskBase,
    id: "task-b",
    title: "Other task",
    projectId: "proj-a",
    assigneeActorIds: ["actor-b"],
  },
  {
    ...taskBase,
    id: "task-done",
    title: "Completed task",
    projectId: "proj-done",
    assigneeActorIds: ["actor-a"],
    status: "done",
  },
] as Task[];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(hooks.useActors).mockReturnValue({
    data: [
      { id: "actor-a", displayName: "Reviewer" },
      { id: "actor-b", displayName: "Reviewer" },
    ],
  } as ReturnType<typeof hooks.useActors>);
  vi.mocked(hooks.useProjects).mockImplementation(
    (filter?: ProjectFilter) =>
      ({
        data: projects.filter(
          (project) => !filter?.status || [filter.status].flat().includes(project.status),
        ),
      }) as ReturnType<typeof hooks.useProjects>,
  );
  vi.mocked(hooks.useTasks).mockImplementation(
    (filter?: TaskFilter) =>
      ({
        data: tasks.filter(
          (task) => !filter?.status || [filter.status].flat().includes(task.status),
        ),
      }) as ReturnType<typeof hooks.useTasks>,
  );
});
afterEach(cleanup);

it("shows projects authorized by actor ID and opens them with a return path", () => {
  render(<AssigneeDetail actorId="actor-a" onBack={vi.fn()} />);
  expect(screen.getByText("Authorized project")).toBeDefined();
  expect(screen.queryByText("Other project")).toBeNull();
  expect(screen.queryByText("Completed project")).toBeNull();
  fireEvent.change(screen.getByLabelText("Status"), { target: { value: "all" } });
  expect(screen.getByText("Completed project")).toBeDefined();
  fireEvent.click(screen.getByText("Authorized project"));
  expect(screen.getByRole("heading", { name: "Project: proj-a" })).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Return to assignee" }));
  expect(screen.getByText("Completed project")).toBeDefined();
});

it("shows directly assigned tasks, supports completed work, and preserves the Tasks tab after Back", () => {
  render(<AssigneeDetail actorId="actor-a" onBack={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Tasks" }));
  expect(screen.getByText("Assigned task")).toBeDefined();
  expect(screen.queryByText("Other task")).toBeNull();
  expect(screen.queryByText("Completed task")).toBeNull();
  fireEvent.change(screen.getByLabelText("Project"), { target: { value: "" } });
  fireEvent.change(screen.getByLabelText("Status"), { target: { value: "all" } });
  expect(screen.getByText("Completed task")).toBeDefined();
  fireEvent.click(screen.getByText("Assigned task"));
  expect(screen.getByRole("heading", { name: "Task: task-a" })).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Return to assignee" }));
  expect(screen.getByText("Completed task")).toBeDefined();
});

it("shows missing assignees and loading errors without showing other people's assignments", () => {
  vi.mocked(hooks.useActors).mockReturnValue({ data: [] } as unknown as ReturnType<
    typeof hooks.useActors
  >);
  render(<AssigneeDetail actorId="missing" onBack={vi.fn()} />);
  expect(screen.getByRole("alert").textContent).toBe("Assignee not found");
  expect(screen.queryByText("Authorized project")).toBeNull();
});
