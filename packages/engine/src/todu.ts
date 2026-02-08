import type {
  CreateHabitInput,
  CreateLabelInput,
  CreateNoteInput,
  CreateProjectInput,
  CreateRecurringInput,
  CreateTaskInput,
  Habit,
  HabitEntry,
  HabitFilter,
  HabitHistoryEntry,
  HabitId,
  HabitStreak,
  Label,
  LabelId,
  Note,
  NoteFilter,
  NoteId,
  Project,
  ProjectId,
  RecurringFilter,
  RecurringId,
  RecurringTemplate,
  Result,
  Task,
  TaskFilter,
  TaskId,
  TaskSortOptions,
  TaskWithDetail,
  ToduError,
  UpdateHabitInput,
  UpdateLabelInput,
  UpdateProjectInput,
  UpdateRecurringInput,
  UpdateTaskInput,
} from "@todu/core";
import type { UpcomingOccurrence } from "./recurring.js";

// ============================================================================
// Config
// ============================================================================

export interface ToduConfig {
  /** Path to data storage directory */
  storagePath: string;
}

// ============================================================================
// SDK Interface — namespace stubs
// Each vertical slice will implement its namespace.
// ============================================================================

export interface ProjectNamespace {
  create(input: CreateProjectInput): Promise<Result<Project>>;
  list(): Promise<Result<Project[]>>;
  get(id: ProjectId): Promise<Result<Project>>;
  update(id: ProjectId, input: UpdateProjectInput): Promise<Result<Project>>;
  delete(id: ProjectId): Promise<Result<void>>;
}

export interface TaskNamespace {
  create(input: CreateTaskInput): Promise<Result<TaskWithDetail>>;
  list(filter?: TaskFilter, sort?: TaskSortOptions): Promise<Result<Task[]>>;
  get(id: TaskId): Promise<Result<TaskWithDetail>>;
  update(id: TaskId, input: UpdateTaskInput): Promise<Result<TaskWithDetail>>;
  delete(id: TaskId): Promise<Result<void>>;
  move(id: TaskId, projectId: ProjectId): Promise<Result<TaskWithDetail>>;
  search(query: string): Promise<Result<Task[]>>;
}

export interface LabelNamespace {
  create(input: CreateLabelInput): Promise<Result<Label>>;
  list(): Promise<Result<Label[]>>;
  update(id: LabelId, input: UpdateLabelInput): Promise<Result<Label>>;
  delete(id: LabelId): Promise<Result<void>>;
}

export interface NoteNamespace {
  create(input: CreateNoteInput): Promise<Result<Note>>;
  list(filter?: NoteFilter): Promise<Result<Note[]>>;
  delete(id: NoteId): Promise<Result<void>>;
}

export interface RecurringNamespace {
  create(input: CreateRecurringInput): Promise<Result<RecurringTemplate>>;
  list(filter?: RecurringFilter): Promise<Result<RecurringTemplate[]>>;
  get(id: RecurringId): Promise<Result<RecurringTemplate>>;
  update(id: RecurringId, input: UpdateRecurringInput): Promise<Result<RecurringTemplate>>;
  delete(id: RecurringId): Promise<Result<void>>;
  pause(id: RecurringId): Promise<Result<RecurringTemplate>>;
  resume(id: RecurringId): Promise<Result<RecurringTemplate>>;
  upcoming(options?: { templateId?: RecurringId; days?: number }): Promise<
    Result<UpcomingOccurrence[]>
  >;
  generate(templateId: RecurringId, date: string): Promise<Result<Task>>;
  process(): Promise<Result<Task[]>>;
}

export interface HabitNamespace {
  create(input: CreateHabitInput): Promise<Result<Habit>>;
  list(filter?: HabitFilter): Promise<Result<Habit[]>>;
  get(id: HabitId): Promise<Result<Habit>>;
  update(id: HabitId, input: UpdateHabitInput): Promise<Result<Habit>>;
  delete(id: HabitId): Promise<Result<void>>;
  pause(id: HabitId): Promise<Result<Habit>>;
  resume(id: HabitId): Promise<Result<Habit>>;
  check(id: HabitId): Promise<Result<HabitEntry>>;
  uncheck(id: HabitId): Promise<Result<void>>;
  streak(id: HabitId): Promise<Result<HabitStreak>>;
  history(id: HabitId, days?: number): Promise<Result<HabitHistoryEntry[]>>;
}

export interface SyncNamespace {
  start(): Promise<void>;
  stop(): Promise<void>;
  status(): { connected: boolean };
}

export interface ConfigNamespace {
  get(): ToduConfig;
}

export interface Todu {
  project: ProjectNamespace;
  task: TaskNamespace;
  label: LabelNamespace;
  note: NoteNamespace;
  recurring: RecurringNamespace;
  habit: HabitNamespace;
  sync: SyncNamespace;
  config: ConfigNamespace;

  /**
   * Register a callback to be notified when data changes.
   * Returns a cleanup function to unsubscribe.
   */
  onChange(callback: () => void): () => void;

  close(): Promise<void>;
}

// ============================================================================
// Stub factory — returns "not implemented" for all operations
// ============================================================================

function notImplemented(): Promise<Result<never, ToduError>> {
  return Promise.reject(new Error("Not implemented"));
}

export function createStubNamespaces(config: ToduConfig): Omit<Todu, "close" | "onChange"> {
  const stub = () => notImplemented();

  return {
    project: {
      create: stub,
      list: stub,
      get: stub,
      update: stub,
      delete: stub,
    },
    task: {
      create: stub,
      list: stub,
      get: stub,
      update: stub,
      delete: stub,
      move: stub,
      search: stub,
    },
    label: {
      create: stub,
      list: stub,
      update: stub,
      delete: stub,
    },
    note: {
      create: stub,
      list: stub,
      delete: stub,
    },
    recurring: {
      create: stub,
      list: stub,
      get: stub,
      update: stub,
      delete: stub,
      pause: stub,
      resume: stub,
      upcoming: stub,
      generate: stub,
      process: stub,
    },
    habit: {
      create: stub,
      list: stub,
      get: stub,
      update: stub,
      delete: stub,
      pause: stub,
      resume: stub,
      check: stub,
      uncheck: stub,
      streak: stub,
      history: stub,
    },
    sync: {
      start: () => Promise.resolve(),
      stop: () => Promise.resolve(),
      status: () => ({ connected: false }),
    },
    config: {
      get: () => config,
    },
  };
}
