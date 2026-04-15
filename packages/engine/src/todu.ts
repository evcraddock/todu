import type {
  Actor,
  ActorId,
  ApprovalItem,
  ApprovalListFilter,
  CreateActorInput,
  CreateHabitInput,
  CreateIntegrationBindingInput,
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
  IntegrationBinding,
  IntegrationBindingFilter,
  IntegrationBindingId,
  IntegrationBindingStatus,
  Label,
  LabelId,
  Note,
  NoteFilter,
  NoteId,
  Project,
  ProjectFilter,
  ProjectId,
  RecurringFilter,
  RecurringId,
  RecurringTemplate,
  RemoteSyncConfig,
  Result,
  Task,
  TaskFilter,
  TaskId,
  TaskSortOptions,
  TaskWithDetail,
  ToduError,
  UpdateHabitInput,
  UpdateIntegrationBindingInput,
  UpdateIntegrationBindingStatusInput,
  UpdateLabelInput,
  UpdateNoteInput,
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

  /** Start a local WebSocket sync server (used by Electron) */
  syncServer?: boolean;

  /** Port for sync server/client (default: 24377) */
  syncPort?: number;

  /** Try to connect to a running sync server (used by CLI) */
  syncClient?: boolean;

  /**
   * Startup template processing policy.
   *
   * Processing is disabled by default. Hosts that own automation policy
   * (for example daemon runtime) opt in explicitly.
   */
  startupTemplateProcessing?: {
    /** Run registered processors during startup when true. */
    enabled?: boolean;
    /** Optional generic exclusions controlled by the host. */
    excludeTypes?: string[];
  };

  /**
   * Remote multi-device sync configuration.
   * When provided, connects a second WebSocketClientAdapter to the remote server.
   * Used by Electron and daemon-backed CLI clients.
   *
   * IMPORTANT: Never use wss://sync.todu.sh in development or tests.
   * Use ws://localhost:3030 via `make dev`.
   */
  remoteSync?: RemoteSyncConfig;
}

// ============================================================================
// SDK Interface — namespace stubs
// Each vertical slice will implement its namespace.
// ============================================================================

export interface ActorNamespace {
  list(): Promise<Result<Actor[]>>;
  create(input: CreateActorInput): Promise<Result<Actor>>;
  getOwner(): Promise<Result<Actor>>;
  setOwner(id: ActorId): Promise<Result<Actor>>;
  rename(id: ActorId, displayName: string): Promise<Result<Actor>>;
  archive(id: ActorId): Promise<Result<Actor>>;
  unarchive(id: ActorId): Promise<Result<Actor>>;
}

export interface ProjectNamespace {
  create(input: CreateProjectInput): Promise<Result<Project>>;
  list(filter?: ProjectFilter): Promise<Result<Project[]>>;
  get(id: ProjectId): Promise<Result<Project>>;
  update(id: ProjectId, input: UpdateProjectInput): Promise<Result<Project>>;
  addAuthorizedActors(id: ProjectId, actorIds: ActorId[]): Promise<Result<Project>>;
  removeAuthorizedActors(id: ProjectId, actorIds: ActorId[]): Promise<Result<Project>>;
  setAuthorizedActors(id: ProjectId, actorIds: ActorId[]): Promise<Result<Project>>;
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

export interface IntegrationNamespace {
  create(input: CreateIntegrationBindingInput): Promise<Result<IntegrationBinding>>;
  list(filter?: IntegrationBindingFilter): Promise<Result<IntegrationBinding[]>>;
  get(id: IntegrationBindingId): Promise<Result<IntegrationBinding>>;
  update(
    id: IntegrationBindingId,
    input: UpdateIntegrationBindingInput,
  ): Promise<Result<IntegrationBinding>>;
  delete(id: IntegrationBindingId): Promise<Result<void>>;
  getStatus(id: IntegrationBindingId): Promise<Result<IntegrationBindingStatus>>;
  updateStatus(
    id: IntegrationBindingId,
    input: UpdateIntegrationBindingStatusInput,
  ): Promise<Result<IntegrationBindingStatus>>;
}

export interface NoteNamespace {
  create(input: CreateNoteInput): Promise<Result<Note>>;
  list(filter?: NoteFilter): Promise<Result<Note[]>>;
  update(id: NoteId, input: UpdateNoteInput): Promise<Result<Note>>;
  delete(id: NoteId): Promise<Result<void>>;
}

export interface ApprovalNamespace {
  list(filter?: ApprovalListFilter): Promise<Result<ApprovalItem[]>>;
  approveTaskDescription(taskId: TaskId): Promise<Result<ApprovalItem>>;
  approveNoteContent(noteId: NoteId): Promise<Result<ApprovalItem>>;
}

export interface RecurringNamespace {
  create(input: CreateRecurringInput): Promise<Result<RecurringTemplate>>;
  list(filter?: RecurringFilter): Promise<Result<RecurringTemplate[]>>;
  get(id: RecurringId): Promise<Result<RecurringTemplate>>;
  update(id: RecurringId, input: UpdateRecurringInput): Promise<Result<RecurringTemplate>>;
  delete(id: RecurringId): Promise<Result<void>>;
  pause(id: RecurringId): Promise<Result<RecurringTemplate>>;
  resume(id: RecurringId): Promise<Result<RecurringTemplate>>;
  upcoming(options?: {
    templateId?: RecurringId;
    days?: number;
  }): Promise<Result<UpcomingOccurrence[]>>;
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

// ============================================================================
// Sync status types
// ============================================================================

/** How this instance coordinates with other local processes. */
export type LocalSyncMode = "standalone" | "ephemeral-client" | "sync-server";

/** Remote multi-device sync connection state. */
export type RemoteSyncState = "disconnected" | "connected" | "syncing";

export interface SyncStatus {
  /** Local coordination mode with other processes on this machine. */
  local: {
    mode: LocalSyncMode;
  };
  /** Multi-device replication state (phase 3 — currently always disconnected). */
  remote: {
    state: RemoteSyncState;
    /** Sync server URL if configured. */
    server?: string;
    /** ISO timestamp of last successful sync. */
    lastSync?: string;
  };
}

export interface SyncNamespace {
  /** Start remote multi-device sync connection. */
  start(): Promise<void>;
  /** Stop remote multi-device sync connection. */
  stop(): Promise<void>;
  /** Get current sync status (local mode + remote state). */
  status(): SyncStatus;
  /**
   * Register a callback for remote sync state changes.
   * Fires when the remote connection transitions between
   * connected/disconnected. Returns a cleanup function.
   */
  onStatusChange(callback: (status: SyncStatus) => void): () => void;
  /**
   * Get the catalog document ID for this instance.
   * Used as a join code so other devices can sync with this one.
   */
  getCatalogId(): string;
}

export interface ConfigNamespace {
  get(): ToduConfig;
}

export interface Todu {
  actor: ActorNamespace;
  project: ProjectNamespace;
  task: TaskNamespace;
  label: LabelNamespace;
  integration: IntegrationNamespace;
  note: NoteNamespace;
  approval: ApprovalNamespace;
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

export interface SyncRuntimeActorTools {
  list(): Promise<Result<Actor[]>>;
  getOwnerActorId(): Promise<Result<ActorId | undefined>>;
  ensure(input: { id: ActorId; displayName: string }): Promise<Result<Actor>>;
}

export interface ToduInternalTools {
  syncRuntime: {
    actors: SyncRuntimeActorTools;
  };
}

export interface ToduWithInternalTools extends Todu {
  __internal: ToduInternalTools;
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
    actor: {
      list: stub,
      create: stub,
      getOwner: stub,
      setOwner: stub,
      rename: stub,
      archive: stub,
      unarchive: stub,
    },
    project: {
      create: stub,
      list: stub,
      get: stub,
      update: stub,
      addAuthorizedActors: stub,
      removeAuthorizedActors: stub,
      setAuthorizedActors: stub,
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
    integration: {
      create: stub,
      list: stub,
      get: stub,
      update: stub,
      delete: stub,
      getStatus: stub,
      updateStatus: stub,
    },
    note: {
      create: stub,
      list: stub,
      update: stub,
      delete: stub,
    },
    approval: {
      list: stub,
      approveTaskDescription: stub,
      approveNoteContent: stub,
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
      status: () => ({
        local: { mode: "standalone" as LocalSyncMode },
        remote: { state: "disconnected" as RemoteSyncState },
      }),
      onStatusChange: () => () => {},
      getCatalogId: () => "",
    },
    config: {
      get: () => config,
    },
  };
}
