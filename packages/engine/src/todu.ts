import type {
  CreateProjectInput,
  Project,
  ProjectId,
  Result,
  TaskId,
  ToduError,
  UpdateProjectInput,
} from "@todu/core";

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
  create(input: unknown): Promise<Result<unknown>>;
  list(filter?: unknown): Promise<Result<unknown[]>>;
  get(id: TaskId): Promise<Result<unknown>>;
  update(id: TaskId, input: unknown): Promise<Result<unknown>>;
  delete(id: TaskId): Promise<Result<void>>;
  move(id: TaskId, projectId: ProjectId): Promise<Result<unknown>>;
  search(query: string): Promise<Result<unknown[]>>;
}

export interface LabelNamespace {
  create(input: unknown): Promise<Result<unknown>>;
  list(): Promise<Result<unknown[]>>;
  update(id: string, input: unknown): Promise<Result<unknown>>;
  delete(id: string): Promise<Result<void>>;
}

export interface CommentNamespace {
  create(taskId: TaskId, input: unknown): Promise<Result<unknown>>;
  list(taskId: TaskId): Promise<Result<unknown[]>>;
}

export interface RecurringNamespace {
  create(input: unknown): Promise<Result<unknown>>;
  list(): Promise<Result<unknown[]>>;
  update(id: string, input: unknown): Promise<Result<unknown>>;
  delete(id: string): Promise<Result<void>>;
  process(): Promise<Result<unknown[]>>;
}

export interface HabitNamespace {
  create(input: unknown): Promise<Result<unknown>>;
  list(): Promise<Result<unknown[]>>;
  update(id: string, input: unknown): Promise<Result<unknown>>;
  delete(id: string): Promise<Result<void>>;
  complete(id: string): Promise<Result<unknown>>;
  streak(id: string): Promise<Result<unknown>>;
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
  comment: CommentNamespace;
  recurring: RecurringNamespace;
  habit: HabitNamespace;
  sync: SyncNamespace;
  config: ConfigNamespace;
  close(): Promise<void>;
}

// ============================================================================
// Stub factory — returns "not implemented" for all operations
// ============================================================================

function notImplemented(): Promise<Result<never, ToduError>> {
  return Promise.reject(new Error("Not implemented"));
}

export function createStubNamespaces(config: ToduConfig): Omit<Todu, "close"> {
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
    comment: {
      create: stub,
      list: stub,
    },
    recurring: {
      create: stub,
      list: stub,
      update: stub,
      delete: stub,
      process: stub,
    },
    habit: {
      create: stub,
      list: stub,
      update: stub,
      delete: stub,
      complete: stub,
      streak: stub,
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
