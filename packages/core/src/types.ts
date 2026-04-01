// ============================================================================
// Branded ID types
// ============================================================================

export type TaskId = string & { readonly __brand: "TaskId" };
export type ProjectId = string & { readonly __brand: "ProjectId" };
export type LabelId = string & { readonly __brand: "LabelId" };
export type NoteId = string & { readonly __brand: "NoteId" };
export type HabitId = string & { readonly __brand: "HabitId" };
export type RecurringId = string & { readonly __brand: "RecurringId" };
export type IntegrationBindingId = string & { readonly __brand: "IntegrationBindingId" };

export function createTaskId(id: string): TaskId {
  return id as TaskId;
}

export function createProjectId(id: string): ProjectId {
  return id as ProjectId;
}

export function createLabelId(id: string): LabelId {
  return id as LabelId;
}

export function createNoteId(id: string): NoteId {
  return id as NoteId;
}

export function createHabitId(id: string): HabitId {
  return id as HabitId;
}

export function createRecurringId(id: string): RecurringId {
  return id as RecurringId;
}

export function createIntegrationBindingId(id: string): IntegrationBindingId {
  return id as IntegrationBindingId;
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

export const INTEGRATION_BINDING_STATES = ["running", "idle", "blocked", "error"] as const;
export type IntegrationBindingState = (typeof INTEGRATION_BINDING_STATES)[number];

export function isIntegrationBindingState(value: string): value is IntegrationBindingState {
  return (INTEGRATION_BINDING_STATES as readonly string[]).includes(value);
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
  createdAt: string;
  updatedAt: string;
}

export interface ProjectFilter {
  status?: ProjectStatus | ProjectStatus[];
  priority?: TaskPriority;
  search?: string;
}

// ============================================================================
// Integration binding entities — shared desired state for external integrations
// ============================================================================

export interface IntegrationBinding {
  id: IntegrationBindingId;
  provider: string;
  projectId: ProjectId;
  targetKind: string;
  targetRef: string;
  strategy: SyncStrategy;
  enabled: boolean;
  options?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationBindingStatus {
  bindingId: IntegrationBindingId;
  state: IntegrationBindingState;
  authorityId: string | null;
  lastSuccessfulSyncAt: string | null;
  lastAttemptedSyncAt: string | null;
  lastErrorSummary: string | null;
  updatedAt: string;
}

// ============================================================================
// Task entity — metadata stored in TaskListDocument
// ============================================================================

export interface Task {
  id: TaskId;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  projectId: ProjectId;
  labels: string[];
  assignees: string[];
  dueDate?: string;
  scheduledDate?: string;
  externalId?: string;
  sourceUrl?: string;
  templateId?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** Task with description loaded from TaskDetailDocument */
export interface TaskWithDetail extends Task {
  description?: string;
}

/** Task with description and comments, used as sync-provider push input */
export interface TaskPushPayload extends TaskWithDetail {
  comments: Note[];
}

// ============================================================================
// Label entity — stored in catalog document
// ============================================================================

export interface Label {
  id: LabelId;
  name: string;
  color?: string;
  createdAt: string;
}

// ============================================================================
// Note entity — stored in partitioned NotesDocument buckets
// ============================================================================

export const NOTE_ENTITY_TYPES = ["task", "project", "habit"] as const;
export type NoteEntityType = (typeof NOTE_ENTITY_TYPES)[number];

export function isNoteEntityType(value: string): value is NoteEntityType {
  return (NOTE_ENTITY_TYPES as readonly string[]).includes(value);
}

export interface Note {
  id: NoteId;
  content: string;
  author: string;
  entityType?: NoteEntityType;
  entityId?: string;
  tags: string[];
  createdAt: string;
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

export interface CreateIntegrationBindingInput {
  provider: string;
  projectId: ProjectId;
  targetKind: string;
  targetRef: string;
  strategy?: SyncStrategy;
  enabled?: boolean;
  options?: Record<string, unknown>;
}

export interface UpdateIntegrationBindingInput {
  provider?: string;
  projectId?: ProjectId;
  targetKind?: string;
  targetRef?: string;
  strategy?: SyncStrategy;
  enabled?: boolean;
  options?: Record<string, unknown>;
}

export interface IntegrationBindingFilter {
  provider?: string;
  projectId?: ProjectId;
  enabled?: boolean;
}

export interface UpdateIntegrationBindingStatusInput {
  state?: IntegrationBindingState;
  authorityId?: string | null;
  lastSuccessfulSyncAt?: string | null;
  lastAttemptedSyncAt?: string | null;
  lastErrorSummary?: string | null;
}

export interface CreateTaskInput {
  title: string;
  projectId: ProjectId;
  status?: TaskStatus;
  priority?: TaskPriority;
  description?: string;
  labels?: string[];
  assignees?: string[];
  dueDate?: string;
  scheduledDate?: string;
  externalId?: string;
  sourceUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface UpdateTaskInput {
  title?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  description?: string;
  labels?: string[];
  assignees?: string[];
  dueDate?: string;
  scheduledDate?: string;
  externalId?: string;
  sourceUrl?: string;
  updatedAt?: string;
}

export interface TaskFilter {
  status?: TaskStatus | TaskStatus[];
  priority?: TaskPriority;
  projectId?: ProjectId;
  label?: string;
  createdFrom?: string;
  createdTo?: string;
  dueBefore?: string;
  dueAfter?: string;
  completedFrom?: string;
  completedTo?: string;
  overdue?: boolean;
  today?: boolean;
  timezone?: string;
}

export const TASK_SORT_FIELDS = ["priority", "dueDate", "createdAt", "updatedAt", "title"] as const;
export type TaskSortField = (typeof TASK_SORT_FIELDS)[number];

export function isTaskSortField(value: string): value is TaskSortField {
  return (TASK_SORT_FIELDS as readonly string[]).includes(value);
}

export interface TaskSortOptions {
  field: TaskSortField;
  direction: "asc" | "desc";
}

export interface CreateLabelInput {
  name: string;
  color?: string;
}

export interface UpdateLabelInput {
  name?: string;
  color?: string;
}

export interface CreateNoteInput {
  content: string;
  author?: string;
  entityType?: NoteEntityType;
  entityId?: string;
  tags?: string[];
  createdAt?: string;
}

export interface UpdateNoteInput {
  content?: string;
  tags?: string[];
}

export interface NoteFilter {
  entityType?: NoteEntityType;
  entityId?: string;
  tag?: string;
  author?: string;
  createdFrom?: string;
  createdTo?: string;
  journal?: boolean;
  timezone?: string;
}

// ============================================================================
// Status transitions
// ============================================================================

/**
 * Allowed status transitions. Key = from status, value = allowed targets.
 * "active" is the default starting status.
 */
export const ALLOWED_STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  active: ["inprogress", "waiting", "done", "canceled"],
  inprogress: ["active", "waiting", "done", "canceled"],
  waiting: ["active", "inprogress", "done", "canceled"],
  done: ["active"], // reopen
  canceled: ["active"], // reopen
};

export function isValidStatusTransition(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return true;
  return ALLOWED_STATUS_TRANSITIONS[from].includes(to);
}

// ============================================================================
// RecurringTemplate entity — stored in catalog document
// ============================================================================

export const RECURRING_MISS_POLICIES = ["accumulate", "rollForward"] as const;
export type RecurringMissPolicy = (typeof RECURRING_MISS_POLICIES)[number];

export interface RecurringTemplate {
  id: RecurringId;
  title: string;
  description?: string;
  projectId: ProjectId;
  labels: string[];
  priority: TaskPriority;
  schedule: string;
  timezone: string;
  startDate: string;
  endDate?: string;
  nextDue: string;
  missPolicy?: RecurringMissPolicy;
  skippedDates: string[];
  paused: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// RecurringTemplate input types
// ============================================================================

export interface CreateRecurringInput {
  title: string;
  schedule: string;
  timezone: string;
  startDate: string;
  projectId: ProjectId;
  description?: string;
  labels?: string[];
  priority?: TaskPriority;
  endDate?: string;
  missPolicy?: RecurringMissPolicy;
}

export interface UpdateRecurringInput {
  title?: string;
  schedule?: string;
  timezone?: string;
  projectId?: ProjectId;
  description?: string;
  labels?: string[];
  priority?: TaskPriority;
  endDate?: string;
  missPolicy?: RecurringMissPolicy;
  paused?: boolean;
}

export interface RecurringFilter {
  paused?: boolean;
  projectId?: ProjectId;
  search?: string;
}

// ============================================================================
// Habit entity — stored in catalog document
// ============================================================================

export interface Habit {
  id: HabitId;
  title: string;
  description?: string;
  projectId: ProjectId;
  schedule: string;
  timezone: string;
  startDate: string;
  endDate?: string;
  nextDue: string;
  paused: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Habit input types
// ============================================================================

export interface CreateHabitInput {
  title: string;
  projectId: ProjectId;
  schedule: string;
  timezone: string;
  startDate: string;
  description?: string;
  endDate?: string;
}

export interface UpdateHabitInput {
  title?: string;
  schedule?: string;
  timezone?: string;
  description?: string;
  endDate?: string;
}

export interface HabitFilter {
  paused?: boolean;
  projectId?: ProjectId;
  search?: string;
  checkedToday?: boolean;
}

// ============================================================================
// Habit check-in types
// ============================================================================

export interface HabitEntry {
  date: string;
  completed: boolean;
  checkedAt?: string;
}

export interface HabitStreak {
  current: number;
  longest: number;
  completedToday: boolean;
  totalCheckins: number;
}

export interface HabitHistoryEntry {
  date: string;
  scheduled: boolean;
  completed: boolean;
}

// ============================================================================
// Schedule types (shared by recurring templates and habits)
// ============================================================================

/**
 * Schedule definition for recurring templates and habits.
 * Uses RRULE (RFC 5545) for recurrence patterns.
 */
export interface ScheduleDefinition {
  /** RRULE string (e.g., "FREQ=DAILY;INTERVAL=1", "FREQ=WEEKLY;BYDAY=MO,WE,FR") */
  rule: string;
  /** IANA timezone for date calculation (e.g., "America/Chicago") */
  timezone: string;
  /** Start date in YYYY-MM-DD format */
  startDate: string;
  /** Optional end date in YYYY-MM-DD format */
  endDate?: string;
}

/** Allowed RRULE frequencies (no sub-daily) */
export const ALLOWED_FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;
export type AllowedFrequency = (typeof ALLOWED_FREQUENCIES)[number];

// ============================================================================
// Settings
// ============================================================================

export interface Settings {
  schemaVersion: number;
}
