import { describe, expect, it } from "vitest";
import { createIntegrationBindingId, createProjectId } from "./types.js";
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_INTEGRATION_FIELD_LENGTH,
  MAX_LABEL_NAME_LENGTH,
  MAX_NOTE_CONTENT_LENGTH,
  MAX_PROJECT_NAME_LENGTH,
  MAX_TASK_TITLE_LENGTH,
  validateCreateIntegrationBindingInput,
  validateCreateLabelInput,
  validateCreateNoteInput,
  validateCreateProjectInput,
  validateCreateRecurringInput,
  validateCreateTaskInput,
  validateDescription,
  validateIntegrationBindingField,
  validateIntegrationBindingProjectUniqueness,
  validateISODate,
  validateLabelColor,
  validateLabelName,
  validateNoteContent,
  validateProjectName,
  validateTaskTitle,
  validateUpdateIntegrationBindingInput,
  validateUpdateIntegrationBindingStatusInput,
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

describe("validateIntegrationBindingField", () => {
  it("accepts a valid integration field", () => {
    expect(validateIntegrationBindingField("provider", "github")).toBeNull();
  });

  it("rejects empty values", () => {
    const error = validateIntegrationBindingField("targetRef", "");
    expect(error?.field).toBe("targetRef");
    expect(error?.message).toContain("required");
  });

  it("rejects values exceeding max length", () => {
    const error = validateIntegrationBindingField(
      "targetKind",
      "a".repeat(MAX_INTEGRATION_FIELD_LENGTH + 1),
    );
    expect(error?.field).toBe("targetKind");
    expect(error?.message).toContain(`${MAX_INTEGRATION_FIELD_LENGTH}`);
  });
});

describe("validateIntegrationBindingProjectUniqueness", () => {
  const bindingId = createIntegrationBindingId("ibind-1");
  const otherBindingId = createIntegrationBindingId("ibind-2");
  const projectId = createProjectId("proj-1");

  const bindings = [
    {
      id: bindingId,
      provider: "github",
      projectId,
      targetKind: "repository",
      targetRef: "owner/repo",
      strategy: "bidirectional" as const,
      enabled: true,
      createdAt: "2026-03-08T00:00:00Z",
      updatedAt: "2026-03-08T00:00:00Z",
    },
  ];

  it("accepts a project without an existing binding", () => {
    expect(
      validateIntegrationBindingProjectUniqueness(createProjectId("proj-2"), bindings),
    ).toBeNull();
  });

  it("rejects a second binding for the same project", () => {
    const error = validateIntegrationBindingProjectUniqueness(projectId, bindings);
    expect(error?.field).toBe("projectId");
    expect(error?.message).toContain("already has an integration binding");
  });

  it("allows the current binding to keep the same project", () => {
    expect(validateIntegrationBindingProjectUniqueness(projectId, bindings, bindingId)).toBeNull();
  });

  it("rejects a different binding using the same project", () => {
    const error = validateIntegrationBindingProjectUniqueness(projectId, bindings, otherBindingId);
    expect(error?.field).toBe("projectId");
  });
});

describe("validateCreateIntegrationBindingInput", () => {
  const projectId = createProjectId("proj-test");

  it("accepts valid input", () => {
    expect(
      validateCreateIntegrationBindingInput({
        provider: "github",
        projectId,
        targetKind: "repository",
        targetRef: "owner/repo",
        strategy: "bidirectional",
      }),
    ).toBeNull();
  });

  it("rejects invalid strategy", () => {
    const error = validateCreateIntegrationBindingInput({
      provider: "github",
      projectId,
      targetKind: "repository",
      targetRef: "owner/repo",
      strategy: "sync" as "pull",
    });
    expect(error?.field).toBe("strategy");
  });

  it("rejects a duplicate project binding", () => {
    const error = validateCreateIntegrationBindingInput(
      {
        provider: "github",
        projectId,
        targetKind: "repository",
        targetRef: "owner/repo",
      },
      [
        {
          id: createIntegrationBindingId("ibind-existing"),
          provider: "forgejo",
          projectId,
          targetKind: "repository",
          targetRef: "owner/other",
          strategy: "pull",
          enabled: true,
          createdAt: "2026-03-08T00:00:00Z",
          updatedAt: "2026-03-08T00:00:00Z",
        },
      ],
    );
    expect(error?.field).toBe("projectId");
  });
});

describe("validateUpdateIntegrationBindingInput", () => {
  const bindingId = createIntegrationBindingId("ibind-existing");
  const projectId = createProjectId("proj-1");
  const otherProjectId = createProjectId("proj-2");

  const bindings = [
    {
      id: bindingId,
      provider: "github",
      projectId,
      targetKind: "repository",
      targetRef: "owner/repo",
      strategy: "bidirectional" as const,
      enabled: true,
      createdAt: "2026-03-08T00:00:00Z",
      updatedAt: "2026-03-08T00:00:00Z",
    },
    {
      id: createIntegrationBindingId("ibind-other"),
      provider: "forgejo",
      projectId: otherProjectId,
      targetKind: "repository",
      targetRef: "owner/forgejo",
      strategy: "pull" as const,
      enabled: true,
      createdAt: "2026-03-08T00:00:00Z",
      updatedAt: "2026-03-08T00:00:00Z",
    },
  ];

  it("accepts a valid partial update", () => {
    expect(validateUpdateIntegrationBindingInput({ targetRef: "owner/new-repo" })).toBeNull();
  });

  it("rejects empty updates", () => {
    const error = validateUpdateIntegrationBindingInput({});
    expect(error?.field).toBe("input");
  });

  it("rejects invalid strategy", () => {
    const error = validateUpdateIntegrationBindingInput({ strategy: "sync" as "push" });
    expect(error?.field).toBe("strategy");
  });

  it("rejects moving to a project that already has a binding", () => {
    const error = validateUpdateIntegrationBindingInput(
      { projectId: otherProjectId },
      { bindings, currentBindingId: bindingId },
    );
    expect(error?.field).toBe("projectId");
  });

  it("allows keeping the current project", () => {
    expect(
      validateUpdateIntegrationBindingInput(
        { projectId },
        { bindings, currentBindingId: bindingId },
      ),
    ).toBeNull();
  });
});

describe("validateUpdateIntegrationBindingStatusInput", () => {
  it("accepts a valid status update", () => {
    expect(
      validateUpdateIntegrationBindingStatusInput({
        state: "running",
        authorityId: "authority-daemon-1",
        lastAttemptedSyncAt: "2026-03-08T10:00:00Z",
        lastSuccessfulSyncAt: "2026-03-08T10:01:00Z",
        lastErrorSummary: null,
      }),
    ).toBeNull();
  });

  it("rejects an empty update", () => {
    const error = validateUpdateIntegrationBindingStatusInput({});
    expect(error?.field).toBe("input");
  });

  it("rejects an invalid state", () => {
    const error = validateUpdateIntegrationBindingStatusInput({ state: "pending" as "idle" });
    expect(error?.field).toBe("state");
  });

  it("rejects an invalid timestamp", () => {
    const error = validateUpdateIntegrationBindingStatusInput({
      lastAttemptedSyncAt: "not-a-date",
    });
    expect(error?.field).toBe("lastAttemptedSyncAt");
  });

  it("rejects blank authority IDs", () => {
    const error = validateUpdateIntegrationBindingStatusInput({ authorityId: "   " });
    expect(error?.field).toBe("authorityId");
  });

  it("rejects blank error summaries", () => {
    const error = validateUpdateIntegrationBindingStatusInput({ lastErrorSummary: "   " });
    expect(error?.field).toBe("lastErrorSummary");
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
