import { describe, expect, it } from "vitest";
import { createProjectId } from "./types.js";
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_LABEL_NAME_LENGTH,
  MAX_NOTE_CONTENT_LENGTH,
  MAX_PROJECT_NAME_LENGTH,
  MAX_TASK_TITLE_LENGTH,
  validateCreateLabelInput,
  validateCreateNoteInput,
  validateCreateProjectInput,
  validateCreateRecurringInput,
  validateCreateTaskInput,
  validateDescription,
  validateISODate,
  validateLabelColor,
  validateLabelName,
  validateNoteContent,
  validateProjectName,
  validateTaskTitle,
  validateUpdateLabelInput,
  validateUpdateNoteInput,
  validateUpdateProjectInput,
  validateUpdateRecurringInput,
  validateUpdateTaskInput,
} from "./validation.js";

describe("validateProjectName", () => {
  it("accepts a valid name", () => {
    expect(validateProjectName("My Project")).toBeNull();
  });

  it("rejects empty string", () => {
    const error = validateProjectName("");
    expect(error).not.toBeNull();
    expect(error?.field).toBe("name");
    expect(error?.message).toContain("required");
  });

  it("rejects whitespace-only string", () => {
    const error = validateProjectName("   ");
    expect(error).not.toBeNull();
    expect(error?.field).toBe("name");
  });

  it("rejects name exceeding max length", () => {
    const longName = "a".repeat(MAX_PROJECT_NAME_LENGTH + 1);
    const error = validateProjectName(longName);
    expect(error).not.toBeNull();
    expect(error?.message).toContain(`${MAX_PROJECT_NAME_LENGTH}`);
  });

  it("accepts name at max length", () => {
    const maxName = "a".repeat(MAX_PROJECT_NAME_LENGTH);
    expect(validateProjectName(maxName)).toBeNull();
  });
});

describe("validateDescription", () => {
  it("accepts a valid description", () => {
    expect(validateDescription("Some description")).toBeNull();
  });

  it("accepts empty description", () => {
    expect(validateDescription("")).toBeNull();
  });

  it("rejects description exceeding max length", () => {
    const longDesc = "a".repeat(MAX_DESCRIPTION_LENGTH + 1);
    const error = validateDescription(longDesc);
    expect(error).not.toBeNull();
    expect(error?.message).toContain(`${MAX_DESCRIPTION_LENGTH}`);
  });
});

describe("validateCreateProjectInput", () => {
  it("accepts valid input with name only", () => {
    expect(validateCreateProjectInput({ name: "Test" })).toBeNull();
  });

  it("accepts valid input with all fields", () => {
    const input = { name: "Test", description: "A project", priority: "high" as const };
    expect(validateCreateProjectInput(input)).toBeNull();
  });

  it("rejects empty name", () => {
    const error = validateCreateProjectInput({ name: "" });
    expect(error?.field).toBe("name");
  });

  it("rejects invalid priority", () => {
    const error = validateCreateProjectInput({
      name: "Test",
      priority: "urgent" as "high",
    });
    expect(error?.field).toBe("priority");
  });

  it("rejects too-long description", () => {
    const error = validateCreateProjectInput({
      name: "Test",
      description: "a".repeat(MAX_DESCRIPTION_LENGTH + 1),
    });
    expect(error?.field).toBe("description");
  });
});

describe("validateUpdateProjectInput", () => {
  it("accepts valid name update", () => {
    expect(validateUpdateProjectInput({ name: "New Name" })).toBeNull();
  });

  it("accepts valid status update", () => {
    expect(validateUpdateProjectInput({ status: "done" })).toBeNull();
  });

  it("accepts valid priority update", () => {
    expect(validateUpdateProjectInput({ priority: "low" })).toBeNull();
  });

  it("accepts multiple field updates", () => {
    expect(validateUpdateProjectInput({ name: "X", status: "done", priority: "high" })).toBeNull();
  });

  it("rejects empty input (no fields)", () => {
    const error = validateUpdateProjectInput({});
    expect(error?.field).toBe("input");
    expect(error?.message).toContain("At least one field");
  });

  it("rejects invalid status", () => {
    const error = validateUpdateProjectInput({ status: "inprogress" as "done" });
    expect(error?.field).toBe("status");
  });

  it("rejects invalid priority", () => {
    const error = validateUpdateProjectInput({ priority: "critical" as "high" });
    expect(error?.field).toBe("priority");
  });

  it("rejects empty name", () => {
    const error = validateUpdateProjectInput({ name: "" });
    expect(error?.field).toBe("name");
  });
});

// ============================================================================
// Task validation tests
// ============================================================================

describe("validateTaskTitle", () => {
  it("accepts a valid title", () => {
    expect(validateTaskTitle("Fix login bug")).toBeNull();
  });

  it("rejects empty string", () => {
    const error = validateTaskTitle("");
    expect(error?.field).toBe("title");
    expect(error?.message).toContain("required");
  });

  it("rejects whitespace-only string", () => {
    expect(validateTaskTitle("   ")).not.toBeNull();
  });

  it("rejects title exceeding max length", () => {
    const error = validateTaskTitle("a".repeat(MAX_TASK_TITLE_LENGTH + 1));
    expect(error).not.toBeNull();
    expect(error?.message).toContain(`${MAX_TASK_TITLE_LENGTH}`);
  });

  it("accepts title at max length", () => {
    expect(validateTaskTitle("a".repeat(MAX_TASK_TITLE_LENGTH))).toBeNull();
  });
});

describe("validateISODate", () => {
  it("accepts valid ISO date", () => {
    expect(validateISODate("dueDate", "2026-03-15")).toBeNull();
  });

  it("accepts valid ISO datetime", () => {
    expect(validateISODate("dueDate", "2026-03-15T10:00:00Z")).toBeNull();
  });

  it("rejects invalid date", () => {
    const error = validateISODate("dueDate", "not-a-date");
    expect(error?.field).toBe("dueDate");
    expect(error?.message).toContain("Invalid date");
  });
});

describe("validateCreateTaskInput", () => {
  const projectId = createProjectId("proj-test");

  it("accepts valid input with title only", () => {
    expect(validateCreateTaskInput({ title: "Do something", projectId })).toBeNull();
  });

  it("accepts valid input with all fields", () => {
    expect(
      validateCreateTaskInput({
        title: "Do something",
        projectId,
        priority: "high",
        description: "Details here",
        labels: ["bug"],
        dueDate: "2026-04-01",
        scheduledDate: "2026-03-30",
      }),
    ).toBeNull();
  });

  it("rejects empty title", () => {
    const error = validateCreateTaskInput({ title: "", projectId });
    expect(error?.field).toBe("title");
  });

  it("rejects invalid priority", () => {
    const error = validateCreateTaskInput({
      title: "Test",
      projectId,
      priority: "urgent" as "high",
    });
    expect(error?.field).toBe("priority");
  });

  it("rejects invalid dueDate", () => {
    const error = validateCreateTaskInput({
      title: "Test",
      projectId,
      dueDate: "tomorrow",
    });
    expect(error?.field).toBe("dueDate");
  });

  it("rejects too-long description", () => {
    const error = validateCreateTaskInput({
      title: "Test",
      projectId,
      description: "a".repeat(MAX_DESCRIPTION_LENGTH + 1),
    });
    expect(error?.field).toBe("description");
  });
});

describe("validateUpdateTaskInput", () => {
  it("accepts valid title update", () => {
    expect(validateUpdateTaskInput({ title: "New title" })).toBeNull();
  });

  it("accepts valid status update", () => {
    expect(validateUpdateTaskInput({ status: "done" }, "active")).toBeNull();
  });

  it("rejects empty input", () => {
    const error = validateUpdateTaskInput({});
    expect(error?.field).toBe("input");
  });

  it("rejects invalid status transition", () => {
    const error = validateUpdateTaskInput({ status: "waiting" }, "done");
    expect(error?.field).toBe("status");
    expect(error?.message).toContain("Cannot transition");
  });

  it("allows reopen from done to active", () => {
    expect(validateUpdateTaskInput({ status: "active" }, "done")).toBeNull();
  });

  it("allows reopen from canceled to active", () => {
    expect(validateUpdateTaskInput({ status: "active" }, "canceled")).toBeNull();
  });

  it("rejects invalid status value", () => {
    const error = validateUpdateTaskInput({ status: "pending" as "done" });
    expect(error?.field).toBe("status");
  });

  it("skips transition check when currentStatus not provided", () => {
    expect(validateUpdateTaskInput({ status: "done" })).toBeNull();
  });
});

describe("validateCreateRecurringInput", () => {
  const projectId = createProjectId("proj-recurring");

  it("accepts valid recurring missPolicy values", () => {
    expect(
      validateCreateRecurringInput({
        title: "Daily review",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2026-03-01",
        projectId,
        missPolicy: "accumulate",
      }),
    ).toBeNull();

    expect(
      validateCreateRecurringInput({
        title: "Daily review",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2026-03-01",
        projectId,
        missPolicy: "rollForward",
      }),
    ).toBeNull();
  });

  it("rejects invalid recurring missPolicy values", () => {
    const error = validateCreateRecurringInput({
      title: "Daily review",
      schedule: "FREQ=DAILY",
      timezone: "UTC",
      startDate: "2026-03-01",
      projectId,
      missPolicy: "skip" as "accumulate",
    });

    expect(error?.field).toBe("missPolicy");
  });
});

describe("validateUpdateRecurringInput", () => {
  it("accepts recurring missPolicy-only updates", () => {
    expect(validateUpdateRecurringInput({ missPolicy: "rollForward" })).toBeNull();
  });

  it("rejects invalid recurring missPolicy updates", () => {
    const error = validateUpdateRecurringInput({ missPolicy: "skip" as "accumulate" });
    expect(error?.field).toBe("missPolicy");
  });
});

// ============================================================================
// Label validation tests
// ============================================================================

describe("validateLabelName", () => {
  it("accepts a valid name", () => {
    expect(validateLabelName("bug")).toBeNull();
  });

  it("rejects empty string", () => {
    const error = validateLabelName("");
    expect(error?.field).toBe("name");
    expect(error?.message).toContain("required");
  });

  it("rejects whitespace-only string", () => {
    expect(validateLabelName("   ")).not.toBeNull();
  });

  it("rejects name exceeding max length", () => {
    const error = validateLabelName("a".repeat(MAX_LABEL_NAME_LENGTH + 1));
    expect(error).not.toBeNull();
  });

  it("accepts name at max length", () => {
    expect(validateLabelName("a".repeat(MAX_LABEL_NAME_LENGTH))).toBeNull();
  });
});

describe("validateLabelColor", () => {
  it("accepts valid hex color", () => {
    expect(validateLabelColor("#FF0000")).toBeNull();
    expect(validateLabelColor("#00ff00")).toBeNull();
    expect(validateLabelColor("#123abc")).toBeNull();
  });

  it("rejects invalid colors", () => {
    expect(validateLabelColor("red")).not.toBeNull();
    expect(validateLabelColor("#FFF")).not.toBeNull();
    expect(validateLabelColor("FF0000")).not.toBeNull();
    expect(validateLabelColor("#GGGGGG")).not.toBeNull();
  });
});

describe("validateCreateLabelInput", () => {
  it("accepts valid input with name only", () => {
    expect(validateCreateLabelInput({ name: "bug" })).toBeNull();
  });

  it("accepts valid input with color", () => {
    expect(validateCreateLabelInput({ name: "bug", color: "#FF0000" })).toBeNull();
  });

  it("rejects empty name", () => {
    const error = validateCreateLabelInput({ name: "" });
    expect(error?.field).toBe("name");
  });

  it("rejects invalid color", () => {
    const error = validateCreateLabelInput({ name: "bug", color: "red" });
    expect(error?.field).toBe("color");
  });
});

describe("validateUpdateLabelInput", () => {
  it("accepts valid name update", () => {
    expect(validateUpdateLabelInput({ name: "feature" })).toBeNull();
  });

  it("accepts valid color update", () => {
    expect(validateUpdateLabelInput({ color: "#00FF00" })).toBeNull();
  });

  it("rejects empty input", () => {
    const error = validateUpdateLabelInput({});
    expect(error?.field).toBe("input");
  });

  it("rejects empty name", () => {
    const error = validateUpdateLabelInput({ name: "" });
    expect(error?.field).toBe("name");
  });
});

// ============================================================================
// Note validation tests
// ============================================================================

describe("validateNoteContent", () => {
  it("accepts valid content", () => {
    expect(validateNoteContent("Some note")).toBeNull();
  });

  it("rejects empty string", () => {
    const error = validateNoteContent("");
    expect(error?.field).toBe("content");
    expect(error?.message).toContain("required");
  });

  it("rejects whitespace-only", () => {
    expect(validateNoteContent("   ")).not.toBeNull();
  });

  it("rejects content exceeding max length", () => {
    const error = validateNoteContent("a".repeat(MAX_NOTE_CONTENT_LENGTH + 1));
    expect(error).not.toBeNull();
  });
});

describe("validateCreateNoteInput", () => {
  it("accepts standalone note (journal)", () => {
    expect(validateCreateNoteInput({ content: "Today was productive" })).toBeNull();
  });

  it("accepts note attached to task", () => {
    expect(
      validateCreateNoteInput({ content: "Progress", entityType: "task", entityId: "task-123" }),
    ).toBeNull();
  });

  it("accepts note attached to project", () => {
    expect(
      validateCreateNoteInput({ content: "Update", entityType: "project", entityId: "proj-abc" }),
    ).toBeNull();
  });

  it("accepts note with tags", () => {
    expect(validateCreateNoteInput({ content: "Thought", tags: ["idea", "design"] })).toBeNull();
  });

  it("rejects empty content", () => {
    const error = validateCreateNoteInput({ content: "" });
    expect(error?.field).toBe("content");
  });

  it("rejects invalid entity type", () => {
    const error = validateCreateNoteInput({
      content: "Note",
      entityType: "label" as "task",
      entityId: "lbl-123",
    });
    expect(error?.field).toBe("entityType");
  });

  it("rejects entityType without entityId", () => {
    const error = validateCreateNoteInput({ content: "Note", entityType: "task" });
    expect(error?.field).toBe("entityId");
  });

  it("rejects entityId without entityType", () => {
    const error = validateCreateNoteInput({ content: "Note", entityId: "task-123" });
    expect(error?.field).toBe("entityType");
  });
});

describe("validateUpdateNoteInput", () => {
  it("accepts content update", () => {
    expect(validateUpdateNoteInput({ content: "Updated content" })).toBeNull();
  });

  it("accepts tags update", () => {
    expect(validateUpdateNoteInput({ tags: ["idea", "review"] })).toBeNull();
  });

  it("accepts both content and tags", () => {
    expect(validateUpdateNoteInput({ content: "New", tags: ["tag"] })).toBeNull();
  });

  it("accepts empty update (no fields)", () => {
    expect(validateUpdateNoteInput({})).toBeNull();
  });

  it("rejects empty content string", () => {
    const error = validateUpdateNoteInput({ content: "" });
    expect(error?.field).toBe("content");
  });

  it("rejects content exceeding max length", () => {
    const error = validateUpdateNoteInput({ content: "x".repeat(MAX_NOTE_CONTENT_LENGTH + 1) });
    expect(error?.field).toBe("content");
  });
});
