import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import { createTaskDetailLines, TaskDetailPane } from "./TaskDetailPane.js";

function createTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    title: "Implement a clear task detail hierarchy",
    status: "inprogress",
    priority: "medium",
    projectId: "project-1",
    labels: ["tui", "layout"],
    assigneeActorIds: [],
    assignees: [],
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
    description:
      "Describe the task with enough detail for a user to understand the intended behavior.",
    ...overrides,
  };
}

function createComment(index: number) {
  return {
    id: `note-${index}`,
    content: `Comment ${index} provides additional implementation context.`,
    author: "Erik",
    entityType: "task",
    entityId: "task-1",
    tags: [],
    createdAt: "2026-07-10T00:00:00.000Z",
  };
}

describe("TaskDetailPane", () => {
  it("renders title, description, metadata, and comments in reading order", () => {
    const { lastFrame } = render(
      <TaskDetailPane
        task={createTask()}
        projects={[{ id: "project-1", name: "todu" }]}
        comments={[createComment(1)]}
        isLoadingDetail={false}
        error={null}
        maxContentWidth={60}
        maxContentRows={12}
      />,
    );

    const frame = lastFrame() ?? "";
    expect(frame).toContain("Implement a clear task detail hierarchy");
    expect(frame).toContain("Description");
    expect(frame).toContain("Metadata");
    expect(frame).toContain("doing • med • todu • #tui #layout");
    expect(frame).toContain("Comments");
    expect(frame).toContain("Erik: Comment 1 provides additional");
    expect(frame).toContain("implementation context.");
    expect(frame.indexOf("Description")).toBeLessThan(frame.indexOf("Metadata"));
    expect(frame.indexOf("Metadata")).toBeLessThan(frame.indexOf("Comments"));
  });

  it("scrolls long description and comment content instead of clipping it", async () => {
    const { stdin, lastFrame } = render(
      <TaskDetailPane
        task={createTask({ description: "long description ".repeat(20) })}
        projects={[{ id: "project-1", name: "todu" }]}
        comments={Array.from({ length: 5 }, (_, index) => createComment(index + 1))}
        isLoadingDetail={false}
        error={null}
        maxContentWidth={20}
        maxContentRows={8}
        scrollEnabled
      />,
    );

    expect(lastFrame()).toContain("↓");
    stdin.write("j");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(lastFrame()).toContain("↑ 1 lines");
  });

  it("wraps all detail text within narrow content widths", () => {
    const description = "A description that should stay readable without horizontal clipping.";
    const lines = createTaskDetailLines({
      task: createTask({ description }),
      projectName: "A project name that does not fit",
      comments: [createComment(1)],
      maxContentWidth: 12,
    });
    const descriptionText = lines
      .filter((line) => /^description-\d+$/.test(line.id))
      .map((line) => line.text)
      .join(" ");

    expect(lines.every((line) => line.text.length <= 12)).toBe(true);
    expect(descriptionText).toBe(description);
  });
});
