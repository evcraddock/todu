import type { CreateProjectInput, UpdateProjectInput, ValidationError } from "./types.js";
import { isProjectStatus, isTaskPriority, validationError } from "./types.js";

// ============================================================================
// Constants
// ============================================================================

export const MAX_PROJECT_NAME_LENGTH = 100;
export const MAX_DESCRIPTION_LENGTH = 2000;

// ============================================================================
// Field validators
// ============================================================================

export function validateProjectName(name: string): ValidationError | null {
  if (!name || name.trim().length === 0) {
    return validationError("name", "Project name is required");
  }
  if (name.trim().length > MAX_PROJECT_NAME_LENGTH) {
    return validationError(
      "name",
      `Project name must be ${MAX_PROJECT_NAME_LENGTH} characters or less`,
    );
  }
  return null;
}

export function validateDescription(description: string): ValidationError | null {
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return validationError(
      "description",
      `Description must be ${MAX_DESCRIPTION_LENGTH} characters or less`,
    );
  }
  return null;
}

// ============================================================================
// Input validators
// ============================================================================

export function validateCreateProjectInput(input: CreateProjectInput): ValidationError | null {
  const nameError = validateProjectName(input.name);
  if (nameError) return nameError;

  if (input.description !== undefined) {
    const descError = validateDescription(input.description);
    if (descError) return descError;
  }

  if (input.priority !== undefined && !isTaskPriority(input.priority)) {
    return validationError("priority", `Invalid priority: ${input.priority}`);
  }

  return null;
}

export function validateUpdateProjectInput(input: UpdateProjectInput): ValidationError | null {
  // At least one field must be provided
  if (
    input.name === undefined &&
    input.description === undefined &&
    input.status === undefined &&
    input.priority === undefined
  ) {
    return validationError("input", "At least one field must be provided");
  }

  if (input.name !== undefined) {
    const nameError = validateProjectName(input.name);
    if (nameError) return nameError;
  }

  if (input.description !== undefined) {
    const descError = validateDescription(input.description);
    if (descError) return descError;
  }

  if (input.status !== undefined && !isProjectStatus(input.status)) {
    return validationError("status", `Invalid status: ${input.status}`);
  }

  if (input.priority !== undefined && !isTaskPriority(input.priority)) {
    return validationError("priority", `Invalid priority: ${input.priority}`);
  }

  return null;
}
