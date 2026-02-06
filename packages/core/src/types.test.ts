import { describe, expect, it } from "bun:test";
import { createTaskId, createProjectId, type TaskId, type ProjectId } from "./types";

describe("types", () => {
  describe("createTaskId", () => {
    it("creates a branded TaskId", () => {
      const id = createTaskId("task-123");
      expect(id).toBe("task-123" as TaskId);
    });
  });

  describe("createProjectId", () => {
    it("creates a branded ProjectId", () => {
      const id = createProjectId("project-456");
      expect(id).toBe("project-456" as ProjectId);
    });
  });
});
