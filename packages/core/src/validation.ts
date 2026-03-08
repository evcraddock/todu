import { validateDateString, validateRRule, validateTimezone } from "./schedule.js";
import type {
  CreateHabitInput,
  CreateIntegrationBindingInput,
  CreateLabelInput,
  CreateNoteInput,
  CreateProjectInput,
  CreateRecurringInput,
  CreateTaskInput,
  IntegrationBinding,
  IntegrationBindingId,
  TaskStatus,
  UpdateHabitInput,
  UpdateIntegrationBindingInput,
  UpdateIntegrationBindingStatusInput,
  UpdateLabelInput,
  UpdateNoteInput,
  UpdateProjectInput,
  UpdateRecurringInput,
  UpdateTaskInput,
  ValidationError,
} from "./types.js";
import {
  isIntegrationBindingState,
  isNoteEntityType,
  isProjectStatus,
  isSyncStrategy,
  isTaskPriority,
  isTaskStatus,
  isValidStatusTransition,
  RECURRING_MISS_POLICIES,
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
export const MAX_INTEGRATION_FIELD_LENGTH = 255;
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

export function validateIntegrationBindingField(
  field: "provider" | "targetKind" | "targetRef",
  value: string,
): ValidationError | null {
  if (!value || value.trim().length === 0) {
    return validationError(field, `${field} is required`);
  }

  if (value.trim().length > MAX_INTEGRATION_FIELD_LENGTH) {
    return validationError(
      field,
      `${field} must be ${MAX_INTEGRATION_FIELD_LENGTH} characters or less`,
    );
  }

  return null;
}

export function validateIntegrationBindingProjectUniqueness(
  projectId: string,
  bindings: IntegrationBinding[],
  currentBindingId?: IntegrationBindingId,
): ValidationError | null {
  const hasConflict = bindings.some(
    (binding) => binding.projectId === projectId && binding.id !== currentBindingId,
  );

  if (hasConflict) {
    return validationError("projectId", `Project already has an integration binding: ${projectId}`);
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

export function validateCreateIntegrationBindingInput(
  input: CreateIntegrationBindingInput,
  bindings: IntegrationBinding[] = [],
): ValidationError | null {
  const providerError = validateIntegrationBindingField("provider", input.provider);
  if (providerError) return providerError;

  const targetKindError = validateIntegrationBindingField("targetKind", input.targetKind);
  if (targetKindError) return targetKindError;

  const targetRefError = validateIntegrationBindingField("targetRef", input.targetRef);
  if (targetRefError) return targetRefError;

  if (input.strategy !== undefined && !isSyncStrategy(input.strategy)) {
    return validationError("strategy", `Invalid sync strategy: ${input.strategy}`);
  }

  return validateIntegrationBindingProjectUniqueness(input.projectId, bindings);
}

export interface ValidateUpdateIntegrationBindingOptions {
  bindings?: IntegrationBinding[];
  currentBindingId?: IntegrationBindingId;
}

export function validateUpdateIntegrationBindingInput(
  input: UpdateIntegrationBindingInput,
  options: ValidateUpdateIntegrationBindingOptions = {},
): ValidationError | null {
  if (
    input.provider === undefined &&
    input.projectId === undefined &&
    input.targetKind === undefined &&
    input.targetRef === undefined &&
    input.strategy === undefined &&
    input.enabled === undefined
  ) {
    return validationError("input", "At least one field must be provided");
  }

  if (input.provider !== undefined) {
    const providerError = validateIntegrationBindingField("provider", input.provider);
    if (providerError) return providerError;
  }

  if (input.targetKind !== undefined) {
    const targetKindError = validateIntegrationBindingField("targetKind", input.targetKind);
    if (targetKindError) return targetKindError;
  }

  if (input.targetRef !== undefined) {
    const targetRefError = validateIntegrationBindingField("targetRef", input.targetRef);
    if (targetRefError) return targetRefError;
  }

  if (input.strategy !== undefined && !isSyncStrategy(input.strategy)) {
    return validationError("strategy", `Invalid sync strategy: ${input.strategy}`);
  }

  if (input.projectId !== undefined) {
    return validateIntegrationBindingProjectUniqueness(
      input.projectId,
      options.bindings ?? [],
      options.currentBindingId,
    );
  }

  return null;
}

export function validateUpdateIntegrationBindingStatusInput(
  input: UpdateIntegrationBindingStatusInput,
): ValidationError | null {
  if (
    input.state === undefined &&
    input.authorityId === undefined &&
    input.lastSuccessfulSyncAt === undefined &&
    input.lastAttemptedSyncAt === undefined &&
    input.lastErrorSummary === undefined
  ) {
    return validationError("input", "At least one field must be provided");
  }

  if (input.state !== undefined && !isIntegrationBindingState(input.state)) {
    return validationError("state", `Invalid integration binding state: ${input.state}`);
  }

  if (input.authorityId !== undefined && input.authorityId !== null) {
    const authorityIdError = validateIntegrationBindingField("provider", input.authorityId);
    if (authorityIdError) {
      return {
        ...authorityIdError,
        field: "authorityId",
        message: authorityIdError.message.replace("provider", "authorityId"),
      };
    }
  }

  if (input.lastSuccessfulSyncAt !== undefined && input.lastSuccessfulSyncAt !== null) {
    const timestampError = validateISODate("lastSuccessfulSyncAt", input.lastSuccessfulSyncAt);
    if (timestampError) return timestampError;
  }

  if (input.lastAttemptedSyncAt !== undefined && input.lastAttemptedSyncAt !== null) {
    const timestampError = validateISODate("lastAttemptedSyncAt", input.lastAttemptedSyncAt);
    if (timestampError) return timestampError;
  }

  if (input.lastErrorSummary !== undefined && input.lastErrorSummary !== null) {
    if (input.lastErrorSummary.trim().length === 0) {
      return validationError("lastErrorSummary", "lastErrorSummary is required");
    }
    const summaryError = validateDescription(input.lastErrorSummary);
    if (summaryError) {
      return {
        ...summaryError,
        field: "lastErrorSummary",
        message: summaryError.message.replace("Description", "lastErrorSummary"),
      };
    }
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

export function validateUpdateNoteInput(input: UpdateNoteInput): ValidationError | null {
  if (input.content !== undefined) {
    const contentError = validateNoteContent(input.content);
    if (contentError) return contentError;
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

  if (input.missPolicy !== undefined && !RECURRING_MISS_POLICIES.includes(input.missPolicy)) {
    return validationError("missPolicy", `Invalid recurring miss policy: ${input.missPolicy}`);
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
    input.missPolicy === undefined &&
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

  if (input.missPolicy !== undefined && !RECURRING_MISS_POLICIES.includes(input.missPolicy)) {
    return validationError("missPolicy", `Invalid recurring miss policy: ${input.missPolicy}`);
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
