import { describe, expect, it } from "vitest";
import {
  createCommentId,
  createHabitId,
  createLabelId,
  createProjectId,
  createTaskId,
} from "./types.js";
import type { CommentId, HabitId, LabelId, ProjectId, TaskId } from "./types.js";

describe("branded IDs", () => {
  it("creates a branded TaskId", () => {
    const id = createTaskId("task-123");
    expect(id).toBe("task-123" as TaskId);
  });

  it("creates a branded ProjectId", () => {
    const id = createProjectId("project-456");
    expect(id).toBe("project-456" as ProjectId);
  });

  it("creates a branded LabelId", () => {
    const id = createLabelId("label-789");
    expect(id).toBe("label-789" as LabelId);
  });

  it("creates a branded CommentId", () => {
    const id = createCommentId("comment-101");
    expect(id).toBe("comment-101" as CommentId);
  });

  it("creates a branded HabitId", () => {
    const id = createHabitId("habit-202");
    expect(id).toBe("habit-202" as HabitId);
  });
});
