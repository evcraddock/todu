// ============================================================================
// Branded ID types
// ============================================================================

export type TaskId = string & { readonly __brand: "TaskId" };
export type ProjectId = string & { readonly __brand: "ProjectId" };
export type LabelId = string & { readonly __brand: "LabelId" };
export type CommentId = string & { readonly __brand: "CommentId" };
export type HabitId = string & { readonly __brand: "HabitId" };
export type RecurringId = string & { readonly __brand: "RecurringId" };

export function createTaskId(id: string): TaskId {
  return id as TaskId;
}

export function createProjectId(id: string): ProjectId {
  return id as ProjectId;
}

export function createLabelId(id: string): LabelId {
  return id as LabelId;
}

export function createCommentId(id: string): CommentId {
  return id as CommentId;
}

export function createHabitId(id: string): HabitId {
  return id as HabitId;
}

export function createRecurringId(id: string): RecurringId {
  return id as RecurringId;
}

// ============================================================================
// Enums and type guards
// ============================================================================

export const TASK_STATUSES = ["active", "inprogress", "waiting", "done", "canceled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value);
}

export const TASK_PRIORITIES = ["low", "medium", "high"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export function isTaskPriority(value: string): value is TaskPriority {
  return (TASK_PRIORITIES as readonly string[]).includes(value);
}

export const PROJECT_STATUSES = ["active", "done", "canceled"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export function isProjectStatus(value: string): value is ProjectStatus {
  return (PROJECT_STATUSES as readonly string[]).includes(value);
}

export const SYNC_STRATEGIES = ["bidirectional", "pull", "push", "none"] as const;
export type SyncStrategy = (typeof SYNC_STRATEGIES)[number];

export function isSyncStrategy(value: string): value is SyncStrategy {
  return (SYNC_STRATEGIES as readonly string[]).includes(value);
}

// ============================================================================
// Result type
// ============================================================================

export type Result<T, E = ToduError> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// ============================================================================
// Error types
// ============================================================================

export type ToduError = NotFoundError | ValidationError | StorageError;

export interface NotFoundError {
  type: "not-found";
  entity: string;
  id: string;
}

export interface ValidationError {
  type: "validation";
  field: string;
  message: string;
}

export interface StorageError {
  type: "storage";
  message: string;
}

export function notFound(entity: string, id: string): NotFoundError {
  return { type: "not-found", entity, id };
}

export function validationError(field: string, message: string): ValidationError {
  return { type: "validation", field, message };
}

export function storageError(message: string): StorageError {
  return { type: "storage", message };
}

// ============================================================================
// Entity types
// ============================================================================

export interface Project {
  id: ProjectId;
  name: string;
  description?: string;
  status: ProjectStatus;
  priority: TaskPriority;
  externalId?: string;
  systemId?: string;
  syncStrategy: SyncStrategy;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Input types
// ============================================================================

export interface CreateProjectInput {
  name: string;
  description?: string;
  priority?: TaskPriority;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  status?: ProjectStatus;
  priority?: TaskPriority;
}

// ============================================================================
// Settings
// ============================================================================

export interface Settings {
  schemaVersion: number;
}
