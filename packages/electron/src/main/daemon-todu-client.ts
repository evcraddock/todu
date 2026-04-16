import { err, ok, type Result, type ToduError } from "@todu/core";
import type { Todu } from "@todu/engine";
import type { DaemonConnectionManager } from "./daemon-connection-manager.js";
import { mapDaemonErrorToToduError } from "./daemon-error-mapping.js";

interface DaemonBackedToduMethods {
  actor: {
    list(): Promise<Result<unknown, ToduError>>;
    create(input: unknown): Promise<Result<unknown, ToduError>>;
    rename(id: string, displayName: string): Promise<Result<unknown, ToduError>>;
    archive(id: string): Promise<Result<unknown, ToduError>>;
    unarchive(id: string): Promise<Result<unknown, ToduError>>;
  };
  project: {
    list(filter?: unknown): Promise<Result<unknown, ToduError>>;
    get(id: string): Promise<Result<unknown, ToduError>>;
    create(input: unknown): Promise<Result<unknown, ToduError>>;
    update(id: string, input: unknown): Promise<Result<unknown, ToduError>>;
  };
  task: {
    list(filter?: unknown, sort?: unknown): Promise<Result<unknown, ToduError>>;
    get(id: string): Promise<Result<unknown, ToduError>>;
    create(input: unknown): Promise<Result<unknown, ToduError>>;
    update(id: string, input: unknown): Promise<Result<unknown, ToduError>>;
    move(id: string, projectId: string): Promise<Result<unknown, ToduError>>;
    search(query: string): Promise<Result<unknown, ToduError>>;
  };
  approval: {
    list(filter?: unknown): Promise<Result<unknown, ToduError>>;
    approveTaskDescription(taskId: string): Promise<Result<unknown, ToduError>>;
    approveNoteContent(noteId: string): Promise<Result<unknown, ToduError>>;
  };
  label: {
    list(): Promise<Result<unknown, ToduError>>;
    create(input: unknown): Promise<Result<unknown, ToduError>>;
  };
  note: {
    list(filter?: unknown): Promise<Result<unknown, ToduError>>;
    create(input: unknown): Promise<Result<unknown, ToduError>>;
  };
  recurring: {
    list(filter?: unknown): Promise<Result<unknown, ToduError>>;
    get(id: string): Promise<Result<unknown, ToduError>>;
    upcoming(options?: unknown): Promise<Result<unknown, ToduError>>;
  };
  habit: {
    list(filter?: unknown): Promise<Result<unknown, ToduError>>;
    get(id: string): Promise<Result<unknown, ToduError>>;
    check(id: string): Promise<Result<unknown, ToduError>>;
    streak(id: string): Promise<Result<unknown, ToduError>>;
    history(id: string, days?: number): Promise<Result<unknown, ToduError>>;
  };
}

export function createDaemonToduClient(daemon: Pick<DaemonConnectionManager, "request">): Todu {
  const invoke = <T>(method: string, params: Record<string, unknown> = {}) =>
    invokeDaemonResult<T>(daemon, method, params);

  const client: DaemonBackedToduMethods = {
    actor: {
      list: () => invoke("actor.list", {}),
      create: (input) => invoke("actor.create", { input }),
      rename: (id, displayName) => invoke("actor.rename", { id, displayName }),
      archive: (id) => invoke("actor.archive", { id }),
      unarchive: (id) => invoke("actor.unarchive", { id }),
    },
    project: {
      list: (filter) => invoke("project.list", { filter }),
      get: (id) => invoke("project.get", { id }),
      create: (input) => invoke("project.create", { input }),
      update: (id, input) => invoke("project.update", { id, input }),
    },
    task: {
      list: (filter, sort) => invoke("task.list", { filter, sort }),
      get: (id) => invoke("task.get", { id }),
      create: (input) => invoke("task.create", { input }),
      update: (id, input) => invoke("task.update", { id, input }),
      move: (id, projectId) => invoke("task.move", { id, projectId }),
      search: (query) => invoke("task.search", { query }),
    },
    approval: {
      list: (filter) => invoke("approval.list", { filter }),
      approveTaskDescription: (taskId) => invoke("approval.approveTaskDescription", { id: taskId }),
      approveNoteContent: (noteId) => invoke("approval.approveNoteContent", { id: noteId }),
    },
    label: {
      list: () => invoke("label.list", {}),
      create: (input) => invoke("label.create", { input }),
    },
    note: {
      list: (filter) => invoke("note.list", { filter }),
      create: (input) => invoke("note.create", { input }),
    },
    recurring: {
      list: (filter) => invoke("recurring.list", { filter }),
      get: (id) => invoke("recurring.get", { id }),
      upcoming: (options) => invoke("recurring.upcoming", { options }),
    },
    habit: {
      list: (filter) => invoke("habit.list", { filter }),
      get: (id) => invoke("habit.get", { id }),
      check: (id) => invoke("habit.check", { id }),
      streak: (id) => invoke("habit.streak", { id }),
      history: (id, days) => invoke("habit.history", { id, days }),
    },
  };

  return client as unknown as Todu;
}

async function invokeDaemonResult<T>(
  daemon: Pick<DaemonConnectionManager, "request">,
  method: string,
  params: Record<string, unknown>,
): Promise<Result<T, ToduError>> {
  const response = await daemon.request<T>(method, params);
  if (response.ok) {
    return ok(response.value);
  }

  return err(mapDaemonErrorToToduError(method, response.error));
}
