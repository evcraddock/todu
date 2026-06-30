import type {
  Actor,
  CreateNoteInput,
  Note,
  NoteFilter,
  Project,
  ProjectFilter,
  ProjectId,
  Task,
  TaskFilter,
  TaskId,
  TaskSortOptions,
  TaskWithDetail,
  UpdateTaskInput,
} from "@todu/core";
import type { DaemonConnection, DaemonConnectionError } from "./connection.js";

export interface TuiSyncStatus {
  local: {
    mode: string;
  };
  remote: {
    state: string;
    server?: string;
    lastSync?: string;
  };
}

export interface TuiToduClient {
  actor: {
    list(): Promise<Actor[]>;
  };
  project: {
    list(filter?: ProjectFilter): Promise<Project[]>;
    get(id: ProjectId | string): Promise<Project>;
  };
  task: {
    list(filter?: TaskFilter, sort?: TaskSortOptions): Promise<Task[]>;
    get(id: TaskId | string): Promise<TaskWithDetail>;
    update(id: TaskId | string, input: UpdateTaskInput): Promise<Task>;
    createComment(taskId: TaskId | string, content: string): Promise<Note>;
  };
  note: {
    list(filter?: NoteFilter): Promise<Note[]>;
    create(input: CreateNoteInput): Promise<Note>;
  };
  sync: {
    status(): Promise<TuiSyncStatus>;
  };
}

export class TuiToduClientError extends Error {
  readonly method: string;
  readonly code: string;
  readonly userMessage: string;
  readonly details?: Record<string, unknown>;

  constructor(options: {
    method: string;
    code: string;
    message: string;
    userMessage: string;
    details?: Record<string, unknown>;
  }) {
    super(options.message);
    this.name = "TuiToduClientError";
    this.method = options.method;
    this.code = options.code;
    this.userMessage = options.userMessage;
    this.details = options.details;
  }
}

export function createTuiToduClient(daemon: Pick<DaemonConnection, "request">): TuiToduClient {
  const invoke = <T>(method: string, params: Record<string, unknown> = {}) =>
    invokeDaemonValue<T>(daemon, method, params);

  return {
    actor: {
      list: () => invoke<Actor[]>("actor.list", {}),
    },
    project: {
      list: (filter) => invoke<Project[]>("project.list", { filter }),
      get: (id) => invoke<Project>("project.get", { id }),
    },
    task: {
      list: (filter, sort) => invoke<Task[]>("task.list", { filter, sort }),
      get: (id) => invoke<TaskWithDetail>("task.get", { id }),
      update: (id, input) => invoke<Task>("task.update", { id, input }),
      createComment: (taskId, content) =>
        invoke<Note>("note.create", {
          input: {
            content,
            entityType: "task",
            entityId: taskId,
          } satisfies CreateNoteInput,
        }),
    },
    note: {
      list: (filter) => invoke<Note[]>("note.list", { filter }),
      create: (input) => invoke<Note>("note.create", { input }),
    },
    sync: {
      status: () => invoke<TuiSyncStatus>("sync.status", {}),
    },
  };
}

export async function invokeDaemonValue<T>(
  daemon: Pick<DaemonConnection, "request">,
  method: string,
  params: Record<string, unknown>,
): Promise<T> {
  const response = await daemon.request<T>(method, params);
  if (response.ok) {
    return response.value;
  }

  throw mapDaemonErrorToClientError(method, response.error);
}

export function mapDaemonErrorToClientError(
  method: string,
  error: DaemonConnectionError,
): TuiToduClientError {
  return new TuiToduClientError({
    method,
    code: error.code,
    message: `${method} failed (${error.code}): ${error.message}`,
    userMessage: formatDaemonErrorForUser(error),
    details: error.details,
  });
}

export function formatToduClientError(error: unknown): string {
  if (error instanceof TuiToduClientError) {
    return error.userMessage;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected TUI data error.";
}

function formatDaemonErrorForUser(error: DaemonConnectionError): string {
  if (error.code === "DAEMON_UNAVAILABLE") {
    return "Daemon unavailable. Start it with: todu daemon start.";
  }

  if (error.code === "TIMEOUT") {
    return "Daemon request timed out. Try again.";
  }

  if (error.code === "NOT_FOUND") {
    const entity = getStringDetail(error.details, "entity") ?? "item";
    const id = getStringDetail(error.details, "id");
    return id ? `${entity} not found: ${id}` : error.message;
  }

  if (error.code === "VALIDATION_ERROR" || error.code === "BAD_REQUEST") {
    return error.message;
  }

  return error.message;
}

function getStringDetail(details: Record<string, unknown> | undefined, key: string): string | null {
  const value = details?.[key];
  return typeof value === "string" ? value : null;
}
