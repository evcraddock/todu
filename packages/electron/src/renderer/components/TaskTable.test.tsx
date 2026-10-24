/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { Task } from "@todu/core/browser";
import { afterEach, expect, it, vi } from "vitest";
import { TaskTable } from "./TaskTable.js";

vi.mock("../hooks/useTodu.js", () => ({
  useActors: () => ({
    data: [
      { id: "actor-a", displayName: "Reviewer" },
      { id: "actor-b", displayName: "Former reviewer", archived: true },
    ],
  }),
}));
afterEach(cleanup);

it("shows assigned names, archived and unknown assignees, legacy names, and unassigned tasks", () => {
  const base = {
    projectId: "proj-1",
    status: "active",
    priority: "medium",
    labels: [],
    assignees: [],
    assigneeActorIds: [],
    createdAt: "2026-10-23",
    updatedAt: "2026-10-23",
  };
  const tasks = [
    { ...base, id: "task-1", title: "Shared work", assigneeActorIds: ["actor-a", "actor-b"] },
    { ...base, id: "task-2", title: "No assignment" },
    { ...base, id: "task-3", title: "Legacy assignment", assignees: ["Legacy reviewer"] },
    { ...base, id: "task-4", title: "Unknown assignment", assigneeActorIds: ["actor-missing"] },
  ] as Task[];
  render(
    <TaskTable tasks={tasks} onSelectTask={vi.fn()} onSort={vi.fn()} projectMap={new Map()} />,
  );
  expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
    "Task",
    "Status",
    "Assignee",
    "Priority",
    "Due",
  ]);
  const sharedRow = screen.getByText("Shared work").closest("tr")!;
  expect(sharedRow.textContent).toContain("Reviewer, Former reviewer (archived)");
  expect(screen.getByText("-")).toBeDefined();
  expect(screen.getByText("Legacy reviewer")).toBeDefined();
  expect(screen.getByText("actor-missing")).toBeDefined();
});

it("opens an assignee without triggering task navigation on click or Enter", () => {
  const selectTask = vi.fn();
  const selectAssignee = vi.fn();
  const task = {
    id: "task-1",
    title: "Shared work",
    projectId: "proj-1",
    status: "active",
    priority: "medium",
    assigneeActorIds: ["actor-a"],
    assignees: [],
    labels: [],
    createdAt: "2026-10-23",
    updatedAt: "2026-10-23",
  } as Task;
  render(
    <TaskTable
      tasks={[task]}
      onSelectTask={selectTask}
      onSelectAssignee={selectAssignee}
      onSort={vi.fn()}
      projectMap={new Map()}
    />,
  );
  const row = screen.getByText("Shared work").closest("tr")!;
  const assignee = within(row).getByRole("button", { name: "Reviewer" });
  fireEvent.keyDown(assignee, { key: "Enter" });
  fireEvent.click(assignee);
  expect(selectAssignee).toHaveBeenCalledWith("actor-a");
  expect(selectTask).not.toHaveBeenCalled();
  fireEvent.keyDown(row, { key: "Enter" });
  expect(selectTask).toHaveBeenCalledWith("task-1");
});
