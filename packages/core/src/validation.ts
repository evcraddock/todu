import { validateDateString, validateRRule, validateTimezone } from "./schedule.js";
import type {
  CreateHabitInput,
  CreateLabelInput,
  CreateNoteInput,
  CreateProjectInput,
  CreateRecurringInput,
  CreateTaskInput,
  TaskStatus,
  UpdateHabitInput,
  UpdateLabelInput,
  UpdateProjectInput,
  UpdateRecurringInput,
  UpdateTaskInput,
  ValidationError,
} from "./types.js";
import {
  isNoteEntityType,
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
export const MAX_LABEL_NAME_LENGTH = 50;
export const MAX_NOTE_CONTENT_LENGTH = 5000;
export const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

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

// ============================================================================
// Label validators
// ============================================================================

export function validateLabelName(name: string): ValidationError | null {
  if (!name || name.trim().length === 0) {
    return validationError("name", "Label name is required");
  }
  if (name.trim().length > MAX_LABEL_NAME_LENGTH) {
    return validationError(
      "name",
      `Label name must be ${MAX_LABEL_NAME_LENGTH} characters or less`,
    );
  }
  return null;
}

export function validateLabelColor(color: string): ValidationError | null {
  if (!HEX_COLOR_REGEX.test(color)) {
    return validationError("color", `Invalid hex color: ${color} (expected #RRGGBB)`);
  }
  return null;
}

export function validateCreateLabelInput(input: CreateLabelInput): ValidationError | null {
  const nameError = validateLabelName(input.name);
  if (nameError) return nameError;

  if (input.color !== undefined) {
    const colorError = validateLabelColor(input.color);
    if (colorError) return colorError;
  }

  return null;
}

export function validateUpdateLabelInput(input: UpdateLabelInput): ValidationError | null {
  if (input.name === undefined && input.color === undefined) {
    return validationError("input", "At least one field must be provided");
  }

  if (input.name !== undefined) {
    const nameError = validateLabelName(input.name);
    if (nameError) return nameError;
  }

  if (input.color !== undefined) {
    const colorError = validateLabelColor(input.color);
    if (colorError) return colorError;
  }

  return null;
}

// ============================================================================
// Note validators
// ============================================================================

export function validateNoteContent(content: string): ValidationError | null {
  if (!content || content.trim().length === 0) {
    return validationError("content", "Note content is required");
  }
  if (content.trim().length > MAX_NOTE_CONTENT_LENGTH) {
    return validationError(
      "content",
      `Note content must be ${MAX_NOTE_CONTENT_LENGTH} characters or less`,
    );
  }
  return null;
}

export function validateCreateNoteInput(input: CreateNoteInput): ValidationError | null {
  const contentError = validateNoteContent(input.content);
  if (contentError) return contentError;

  if (input.entityType !== undefined && !isNoteEntityType(input.entityType)) {
    return validationError("entityType", `Invalid entity type: ${input.entityType}`);
  }

  // If entityType is set, entityId must also be set (and vice versa)
  if (input.entityType !== undefined && !input.entityId) {
    return validationError("entityId", "Entity ID is required when entity type is specified");
  }
  if (input.entityId !== undefined && !input.entityType) {
    return validationError("entityType", "Entity type is required when entity ID is specified");
  }

  return null;
}

// ============================================================================
// Recurring template validators
// ============================================================================

export function validateCreateRecurringInput(input: CreateRecurringInput): ValidationError | null {
  const titleError = validateTaskTitle(input.title);
  if (titleError) return titleError;

  const ruleError = validateRRule(input.schedule);
  if (ruleError) return ruleError;

  const tzError = validateTimezone(input.timezone);
  if (tzError) return tzError;

  const startError = validateDateString("startDate", input.startDate);
  if (startError) return startError;

  if (input.endDate !== undefined) {
    const endError = validateDateString("endDate", input.endDate);
    if (endError) return endError;

    if (input.endDate <= input.startDate) {
      return validationError("endDate", "End date must be after start date");
    }
  }

  if (input.description !== undefined) {
    const descError = validateDescription(input.description);
    if (descError) return descError;
  }

  if (input.priority !== undefined && !isTaskPriority(input.priority)) {
    return validationError("priority", `Invalid priority: ${input.priority}`);
  }

  return null;
}

export function validateUpdateRecurringInput(input: UpdateRecurringInput): ValidationError | null {
  if (
    input.title === undefined &&
    input.schedule === undefined &&
    input.timezone === undefined &&
    input.projectId === undefined &&
    input.description === undefined &&
    input.labels === undefined &&
    input.priority === undefined &&
    input.endDate === undefined &&
    input.paused === undefined
  ) {
    return validationError("input", "At least one field must be provided");
  }

  if (input.title !== undefined) {
    const titleError = validateTaskTitle(input.title);
    if (titleError) return titleError;
  }

  if (input.schedule !== undefined) {
    const ruleError = validateRRule(input.schedule);
    if (ruleError) return ruleError;
  }

  if (input.timezone !== undefined) {
    const tzError = validateTimezone(input.timezone);
    if (tzError) return tzError;
  }

  if (input.description !== undefined) {
    const descError = validateDescription(input.description);
    if (descError) return descError;
  }

  if (input.priority !== undefined && !isTaskPriority(input.priority)) {
    return validationError("priority", `Invalid priority: ${input.priority}`);
  }

  if (input.endDate !== undefined) {
    const endError = validateDateString("endDate", input.endDate);
    if (endError) return endError;
  }

  return null;
}

// ============================================================================
// Habit validators
// ============================================================================

export const MAX_HABIT_TITLE_LENGTH = 100;

export function validateHabitTitle(title: string): ValidationError | null {
  if (!title || title.trim().length === 0) {
    return validationError("title", "Habit title is required");
  }
  if (title.trim().length > MAX_HABIT_TITLE_LENGTH) {
    return validationError(
      "title",
      `Habit title must be ${MAX_HABIT_TITLE_LENGTH} characters or less`,
    );
  }
  return null;
}

export function validateCreateHabitInput(input: CreateHabitInput): ValidationError | null {
  const titleError = validateHabitTitle(input.title);
  if (titleError) return titleError;

  const ruleError = validateRRule(input.schedule);
  if (ruleError) return ruleError;

  const tzError = validateTimezone(input.timezone);
  if (tzError) return tzError;

  const startError = validateDateString("startDate", input.startDate);
  if (startError) return startError;

  if (input.endDate !== undefined) {
    const endError = validateDateString("endDate", input.endDate);
    if (endError) return endError;

    if (input.endDate <= input.startDate) {
      return validationError("endDate", "End date must be after start date");
    }
  }

  if (input.description !== undefined) {
    const descError = validateDescription(input.description);
    if (descError) return descError;
  }

  return null;
}

export function validateUpdateHabitInput(input: UpdateHabitInput): ValidationError | null {
  if (
    input.title === undefined &&
    input.schedule === undefined &&
    input.timezone === undefined &&
    input.description === undefined &&
    input.endDate === undefined
  ) {
    return validationError("input", "At least one field must be provided");
  }

  if (input.title !== undefined) {
    const titleError = validateHabitTitle(input.title);
    if (titleError) return titleError;
  }

  if (input.schedule !== undefined) {
    const ruleError = validateRRule(input.schedule);
    if (ruleError) return ruleError;
  }

  if (input.timezone !== undefined) {
    const tzError = validateTimezone(input.timezone);
    if (tzError) return tzError;
  }

  if (input.description !== undefined) {
    const descError = validateDescription(input.description);
    if (descError) return descError;
  }

  if (input.endDate !== undefined) {
    const endError = validateDateString("endDate", input.endDate);
    if (endError) return endError;
  }

  return null;
}
