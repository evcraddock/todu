import { describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  createEmptyCatalog,
  createTaskDetailDocument,
  createTaskListDocument,
} from "./schema.js";
import { createProjectId } from "./types.js";

describe("schema", () => {
  it("exports schema version", () => {
    expect(SCHEMA_VERSION).toBe(1);
  });

  describe("createEmptyCatalog", () => {
    it("creates a catalog with correct version", () => {
      const catalog = createEmptyCatalog();
      expect(catalog.version).toBe(SCHEMA_VERSION);
    });

    it("creates a catalog with empty projects", () => {
      const catalog = createEmptyCatalog();
      expect(catalog.projects).toEqual([]);
    });

    it("creates a catalog with empty taskListDocIds", () => {
      const catalog = createEmptyCatalog();
      expect(catalog.taskListDocIds).toEqual({});
    });

    it("creates a catalog with settings", () => {
      const catalog = createEmptyCatalog();
      expect(catalog.settings.schemaVersion).toBe(SCHEMA_VERSION);
    });
  });

  describe("createTaskListDocument", () => {
    it("creates a task list for a project", () => {
      const projectId = createProjectId("proj-abc");
      const doc = createTaskListDocument(projectId);
      expect(doc.projectId).toBe(projectId);
      expect(doc.tasks).toEqual([]);
      expect(doc.detailDocIds).toEqual({});
    });
  });

  describe("createTaskDetailDocument", () => {
    it("creates a detail document", () => {
      const doc = createTaskDetailDocument("task-123", "Some description");
      expect(doc.taskId).toBe("task-123");
      expect(doc.description).toBe("Some description");
    });
  });
});
