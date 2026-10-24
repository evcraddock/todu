/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TaskList } from "./TaskList.js";

const list = vi.hoisted(() => vi.fn());
vi.mock("../hooks/useTodu.js", () => ({
  useTasks: list,
  useActors: () => ({ data: [{ id: "actor-a", displayName: "Reviewer" }] }),
  useProjects: () => ({
    data: [
      { id: "proj-active", name: "Active sample", status: "active" },
      { id: "proj-done", name: "Done sample", status: "done" },
      { id: "proj-canceled", name: "Canceled sample", status: "canceled" },
    ],
  }),
}));
vi.mock("../components/TaskTable.js", () => ({
  TaskTable: ({ tasks }: { tasks: { id: string; title: string }[] }) => (
    <div>
      {tasks.map((task) => (
        <div key={task.id}>{task.title}</div>
      ))}
    </div>
  ),
}));
afterEach(() => {
  cleanup();
  localStorage.clear();
});

it("filters rows by assignee and unassigned without passing renderer scope to the backend", () => {
  list.mockReturnValue({
    data: [
      {
        id: "task-a",
        projectId: "proj-active",
        title: "Assigned task",
        assigneeActorIds: ["actor-a"],
        assignees: [],
      },
      {
        id: "task-b",
        projectId: "proj-active",
        title: "Unassigned task",
        assigneeActorIds: [],
        assignees: [],
      },
      {
        id: "task-c",
        projectId: "proj-active",
        title: "Legacy task",
        assigneeActorIds: [],
        assignees: ["Reviewer"],
      },
    ],
  });
  render(<TaskList onSelectTask={vi.fn()} onCreateTask={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Assignee"), { target: { value: "actor-a" } });
  expect(screen.getByText("Assigned task")).toBeDefined();
  expect(screen.queryByText("Unassigned task")).toBeNull();
  expect(screen.queryByText("Legacy task")).toBeNull();
  expect(list).toHaveBeenLastCalledWith({ status: ["active", "inprogress", "waiting"] }, undefined);
  fireEvent.change(screen.getByLabelText("Assignee"), { target: { value: "unassigned" } });
  expect(screen.getByText("Unassigned task")).toBeDefined();
  expect(screen.queryByText("Assigned task")).toBeNull();
  expect(screen.queryByText("Legacy task")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(screen.getByText("Legacy task")).toBeDefined();
});

it("defaults to active projects, supports All projects and specific projects, and keeps UI scope out of RPC filters", () => {
  list.mockReturnValue({
    data: [
      { id: "task-1", projectId: "proj-active", title: "Active project task" },
      { id: "task-2", projectId: "proj-done", title: "Done project task" },
      { id: "task-3", projectId: "proj-canceled", title: "Canceled project task" },
    ],
  });
  render(<TaskList onSelectTask={vi.fn()} onCreateTask={vi.fn()} />);
  expect((screen.getByLabelText("Project") as HTMLSelectElement).value).toBe("active-projects");
  expect(screen.getByText("Active project task")).toBeDefined();
  expect(screen.queryByText("Done project task")).toBeNull();
  expect(screen.queryByText("Canceled project task")).toBeNull();
  expect(list).toHaveBeenLastCalledWith({ status: ["active", "inprogress", "waiting"] }, undefined);
  fireEvent.change(screen.getByLabelText("Project"), { target: { value: "" } });
  expect(screen.getByText("Done project task")).toBeDefined();
  expect(screen.getByText("Canceled project task")).toBeDefined();
  fireEvent.change(screen.getByLabelText("Project"), { target: { value: "proj-done" } });
  expect(list).toHaveBeenLastCalledWith(
    { status: ["active", "inprogress", "waiting"], projectId: "proj-done" },
    undefined,
  );
});
