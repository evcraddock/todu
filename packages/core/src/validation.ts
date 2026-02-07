import type {
  CreateProjectInput,
  CreateTaskInput,
  TaskStatus,
  UpdateProjectInput,
  UpdateTaskInput,
  ValidationError,
} from "./types.js";
import {
  isProjectStatus,
  isTaskPriority,
  isTaskStatus,
  isValidStatusTransition,
  validationError,
} from "./types.js";

// ============================================================================
// Constants
// ============================================================================

export const MAX_PROJECT_NAME_LENGTH = 100;
export const MAX_TASK_TITLE_LENGTH = 200;
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

// ============================================================================
// Task validators
// ============================================================================

export function validateTaskTitle(title: string): ValidationError | null {
  if (!title || title.trim().length === 0) {
    return validationError("title", "Task title is required");
  }
  if (title.trim().length > MAX_TASK_TITLE_LENGTH) {
    return validationError(
      "title",
      `Task title must be ${MAX_TASK_TITLE_LENGTH} characters or less`,
    );
  }
  return null;
}

export function validateISODate(field: string, value: string): ValidationError | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return validationError(field, `Invalid date: ${value}`);
  }
  return null;
}

export function validateCreateTaskInput(input: CreateTaskInput): ValidationError | null {
  const titleError = validateTaskTitle(input.title);
  if (titleError) return titleError;

  if (input.description !== undefined) {
    const descError = validateDescription(input.description);
    if (descError) return descError;
  }

  if (input.priority !== undefined && !isTaskPriority(input.priority)) {
    return validationError("priority", `Invalid priority: ${input.priority}`);
  }

  if (input.dueDate !== undefined) {
    const dateError = validateISODate("dueDate", input.dueDate);
    if (dateError) return dateError;
  }

  if (input.scheduledDate !== undefined) {
    const dateError = validateISODate("scheduledDate", input.scheduledDate);
    if (dateError) return dateError;
  }

  return null;
}

export function validateUpdateTaskInput(
  input: UpdateTaskInput,
  currentStatus?: TaskStatus,
): ValidationError | null {
  if (
    input.title === undefined &&
    input.status === undefined &&
    input.priority === undefined &&
    input.description === undefined &&
    input.labels === undefined &&
    input.dueDate === undefined &&
    input.scheduledDate === undefined
  ) {
    return validationError("input", "At least one field must be provided");
  }

  if (input.title !== undefined) {
    const titleError = validateTaskTitle(input.title);
    if (titleError) return titleError;
  }

  if (input.description !== undefined) {
    const descError = validateDescription(input.description);
    if (descError) return descError;
  }

  if (input.status !== undefined) {
    if (!isTaskStatus(input.status)) {
      return validationError("status", `Invalid status: ${input.status}`);
    }
    if (currentStatus !== undefined && !isValidStatusTransition(currentStatus, input.status)) {
      return validationError(
        "status",
        `Cannot transition from ${currentStatus} to ${input.status}`,
      );
    }
  }

  if (input.priority !== undefined && !isTaskPriority(input.priority)) {
    return validationError("priority", `Invalid priority: ${input.priority}`);
  }

  if (input.dueDate !== undefined) {
    const dateError = validateISODate("dueDate", input.dueDate);
    if (dateError) return dateError;
  }

  if (input.scheduledDate !== undefined) {
    const dateError = validateISODate("scheduledDate", input.scheduledDate);
    if (dateError) return dateError;
  }

  return null;
}
