import { describe, expect, it } from "vitest";
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_PROJECT_NAME_LENGTH,
  validateCreateProjectInput,
  validateDescription,
  validateProjectName,
  validateUpdateProjectInput,
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
