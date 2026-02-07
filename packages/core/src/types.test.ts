import { describe, expect, it } from "vitest";
import {
  createHabitId,
  createLabelId,
  createNoteId,
  createProjectId,
  createRecurringId,
  createTaskId,
  err,
  isNoteEntityType,
  isProjectStatus,
  isSyncStrategy,
  isTaskPriority,
  isTaskSortField,
  isTaskStatus,
  isValidStatusTransition,
  notFound,
  ok,
  storageError,
  validationError,
} from "./types.js";
import type { HabitId, LabelId, NoteId, ProjectId, RecurringId, TaskId } from "./types.js";

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

  it("creates a branded NoteId", () => {
    const id = createNoteId("note-101");
    expect(id).toBe("note-101" as NoteId);
  });

  it("creates a branded HabitId", () => {
    const id = createHabitId("habit-202");
    expect(id).toBe("habit-202" as HabitId);
  });

  it("creates a branded RecurringId", () => {
    const id = createRecurringId("recurring-303");
    expect(id).toBe("recurring-303" as RecurringId);
  });
});

describe("type guards", () => {
  describe("isTaskStatus", () => {
    it("accepts valid statuses", () => {
      expect(isTaskStatus("active")).toBe(true);
      expect(isTaskStatus("inprogress")).toBe(true);
      expect(isTaskStatus("waiting")).toBe(true);
      expect(isTaskStatus("done")).toBe(true);
      expect(isTaskStatus("canceled")).toBe(true);
    });

    it("rejects invalid statuses", () => {
      expect(isTaskStatus("todo")).toBe(false);
      expect(isTaskStatus("in-progress")).toBe(false);
      expect(isTaskStatus("")).toBe(false);
      expect(isTaskStatus("ACTIVE")).toBe(false);
    });
  });

  describe("isTaskPriority", () => {
    it("accepts valid priorities", () => {
      expect(isTaskPriority("low")).toBe(true);
      expect(isTaskPriority("medium")).toBe(true);
      expect(isTaskPriority("high")).toBe(true);
    });

    it("rejects invalid priorities", () => {
      expect(isTaskPriority("urgent")).toBe(false);
      expect(isTaskPriority("")).toBe(false);
      expect(isTaskPriority("HIGH")).toBe(false);
    });
  });

  describe("isProjectStatus", () => {
    it("accepts valid statuses", () => {
      expect(isProjectStatus("active")).toBe(true);
      expect(isProjectStatus("done")).toBe(true);
      expect(isProjectStatus("canceled")).toBe(true);
    });

    it("rejects invalid statuses", () => {
      expect(isProjectStatus("inprogress")).toBe(false);
      expect(isProjectStatus("waiting")).toBe(false);
    });
  });

  describe("isNoteEntityType", () => {
    it("accepts valid entity types", () => {
      expect(isNoteEntityType("task")).toBe(true);
      expect(isNoteEntityType("project")).toBe(true);
      expect(isNoteEntityType("habit")).toBe(true);
    });

    it("rejects invalid entity types", () => {
      expect(isNoteEntityType("label")).toBe(false);
      expect(isNoteEntityType("note")).toBe(false);
      expect(isNoteEntityType("")).toBe(false);
    });
  });

  describe("isTaskSortField", () => {
    it("accepts valid sort fields", () => {
      expect(isTaskSortField("priority")).toBe(true);
      expect(isTaskSortField("dueDate")).toBe(true);
      expect(isTaskSortField("createdAt")).toBe(true);
      expect(isTaskSortField("updatedAt")).toBe(true);
      expect(isTaskSortField("title")).toBe(true);
    });

    it("rejects invalid sort fields", () => {
      expect(isTaskSortField("name")).toBe(false);
      expect(isTaskSortField("status")).toBe(false);
      expect(isTaskSortField("")).toBe(false);
    });
  });

  describe("isSyncStrategy", () => {
    it("accepts valid strategies", () => {
      expect(isSyncStrategy("bidirectional")).toBe(true);
      expect(isSyncStrategy("pull")).toBe(true);
      expect(isSyncStrategy("push")).toBe(true);
      expect(isSyncStrategy("none")).toBe(true);
    });

    it("rejects invalid strategies", () => {
      expect(isSyncStrategy("sync")).toBe(false);
      expect(isSyncStrategy("")).toBe(false);
    });
  });
});

describe("Result helpers", () => {
  it("creates ok result", () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(42);
    }
  });

  it("creates err result", () => {
    const error = notFound("task", "123");
    const result = err(error);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("not-found");
      expect(result.error.entity).toBe("task");
      expect(result.error.id).toBe("123");
    }
  });
});

describe("error factories", () => {
  it("creates NotFoundError", () => {
    const error = notFound("project", "abc");
    expect(error).toEqual({ type: "not-found", entity: "project", id: "abc" });
  });

  it("creates ValidationError", () => {
    const error = validationError("title", "Title is required");
    expect(error).toEqual({ type: "validation", field: "title", message: "Title is required" });
  });

  it("creates StorageError", () => {
    const error = storageError("Disk full");
    expect(error).toEqual({ type: "storage", message: "Disk full" });
  });
});

describe("isValidStatusTransition", () => {
  it("allows same status (no-op)", () => {
    expect(isValidStatusTransition("active", "active")).toBe(true);
    expect(isValidStatusTransition("done", "done")).toBe(true);
  });

  it("allows active → inprogress", () => {
    expect(isValidStatusTransition("active", "inprogress")).toBe(true);
  });

  it("allows active → done", () => {
    expect(isValidStatusTransition("active", "done")).toBe(true);
  });

  it("allows inprogress → done", () => {
    expect(isValidStatusTransition("inprogress", "done")).toBe(true);
  });

  it("allows done → active (reopen)", () => {
    expect(isValidStatusTransition("done", "active")).toBe(true);
  });

  it("allows canceled → active (reopen)", () => {
    expect(isValidStatusTransition("canceled", "active")).toBe(true);
  });

  it("rejects done → inprogress", () => {
    expect(isValidStatusTransition("done", "inprogress")).toBe(false);
  });

  it("rejects done → waiting", () => {
    expect(isValidStatusTransition("done", "waiting")).toBe(false);
  });

  it("rejects canceled → done", () => {
    expect(isValidStatusTransition("canceled", "done")).toBe(false);
  });
});
