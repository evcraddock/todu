import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import { TaskListPane } from "./TaskListPane.js";

function createTask(index: number) {
  return {
    id: `task-${index}`,
    title: `Task ${index}`,
    status: "active",
    priority: "medium",
    projectId: "project-1",
    labels: [],
    assigneeActorIds: [],
    assignees: [],
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
  };
}

describe("TaskListPane", () => {
  it("shows above and below indicators around a long selected task window", () => {
    const tasks = Array.from({ length: 8 }, (_, index) => createTask(index + 1));
    const { lastFrame } = render(
      <TaskListPane tasks={tasks} selectedTaskId="task-5" maxVisibleTasks={3} width="60" />,
    );

    expect(lastFrame()).toContain("↑ 3 more");
    expect(lastFrame()).toContain("> [med] [active] Task 5");
    expect(lastFrame()).toContain("↓ 2 more");
    expect(lastFrame()).not.toContain("Task 1");
    expect(lastFrame()).not.toContain("Task 8");
  });
});
