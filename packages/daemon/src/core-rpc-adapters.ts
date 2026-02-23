import {
  type CreateLabelInput,
  type CreateNoteInput,
  type CreateProjectInput,
  type CreateTaskInput,
  createLabelId,
  createNoteId,
  createProjectId,
  createTaskId,
  type NoteFilter,
  type ProjectFilter,
  type Result,
  type TaskFilter,
  type TaskSortOptions,
  type ToduError,
  type UpdateLabelInput,
  type UpdateNoteInput,
  type UpdateProjectInput,
  type UpdateTaskInput,
} from "@todu/core";
import type { Todu } from "@todu/engine";
import {
  createProtocolError,
  createProtocolErrorFrame,
  createProtocolSuccessFrame,
  type ProtocolRequestFrame,
} from "./protocol.js";
import type { DaemonRpcMethodHandler, DaemonRpcNamespaceHandlers } from "./rpc.js";

export interface CreateProjectTaskLabelNoteNamespaceHandlersOptions {
  getTodu: () => Todu | null;
}

export function createProjectTaskLabelNoteNamespaceHandlers(
  options: CreateProjectTaskLabelNoteNamespaceHandlersOptions,
): DaemonRpcNamespaceHandlers {
  const method = createMethodExecutor(options.getTodu);

  return {
    project: {
      create: method(async (request, todu) => {
        const input = getRequiredObjectParam<CreateProjectInput>(request, "input");
        return todu.project.create(input);
      }),
      list: method(async (request, todu) => {
        const filter = getOptionalObjectParam<ProjectFilter>(request, "filter");
        return todu.project.list(filter);
      }),
      get: method(async (request, todu) => {
        const id = createProjectId(getRequiredStringParam(request, "id"));
        return todu.project.get(id);
      }),
      update: method(async (request, todu) => {
        const id = createProjectId(getRequiredStringParam(request, "id"));
        const input = getRequiredObjectParam<UpdateProjectInput>(request, "input");
        return todu.project.update(id, input);
      }),
      delete: method(async (request, todu) => {
        const id = createProjectId(getRequiredStringParam(request, "id"));
        return todu.project.delete(id);
      }),
    },
    task: {
      create: method(async (request, todu) => {
        const input = getRequiredObjectParam<CreateTaskInput>(request, "input");
        return todu.task.create(input);
      }),
      list: method(async (request, todu) => {
        const filter = getOptionalObjectParam<TaskFilter>(request, "filter");
        const sort = getOptionalObjectParam<TaskSortOptions>(request, "sort");
        return todu.task.list(filter, sort);
      }),
      get: method(async (request, todu) => {
        const id = createTaskId(getRequiredStringParam(request, "id"));
        return todu.task.get(id);
      }),
      update: method(async (request, todu) => {
        const id = createTaskId(getRequiredStringParam(request, "id"));
        const input = getRequiredObjectParam<UpdateTaskInput>(request, "input");
        return todu.task.update(id, input);
      }),
      delete: method(async (request, todu) => {
        const id = createTaskId(getRequiredStringParam(request, "id"));
        return todu.task.delete(id);
      }),
      move: method(async (request, todu) => {
        const id = createTaskId(getRequiredStringParam(request, "id"));
        const projectId = createProjectId(getRequiredStringParam(request, "projectId"));
        return todu.task.move(id, projectId);
      }),
      search: method(async (request, todu) => {
        const query = getRequiredStringParam(request, "query");
        return todu.task.search(query);
      }),
    },
    label: {
      create: method(async (request, todu) => {
        const input = getRequiredObjectParam<CreateLabelInput>(request, "input");
        return todu.label.create(input);
      }),
      list: method(async (_request, todu) => {
        return todu.label.list();
      }),
      update: method(async (request, todu) => {
        const id = createLabelId(getRequiredStringParam(request, "id"));
        const input = getRequiredObjectParam<UpdateLabelInput>(request, "input");
        return todu.label.update(id, input);
      }),
      delete: method(async (request, todu) => {
        const id = createLabelId(getRequiredStringParam(request, "id"));
        return todu.label.delete(id);
      }),
    },
    note: {
      create: method(async (request, todu) => {
        const input = getRequiredObjectParam<CreateNoteInput>(request, "input");
        return todu.note.create(input);
      }),
      list: method(async (request, todu) => {
        const filter = getOptionalObjectParam<NoteFilter>(request, "filter");
        return todu.note.list(filter);
      }),
      update: method(async (request, todu) => {
        const id = createNoteId(getRequiredStringParam(request, "id"));
        const input = getRequiredObjectParam<UpdateNoteInput>(request, "input");
        return todu.note.update(id, input);
      }),
      delete: method(async (request, todu) => {
        const id = createNoteId(getRequiredStringParam(request, "id"));
        return todu.note.delete(id);
      }),
    },
  };
}

function createMethodExecutor(
  getTodu: () => Todu | null,
): (
  operation: (request: ProtocolRequestFrame, todu: Todu) => Promise<Result<unknown, ToduError>>,
) => DaemonRpcMethodHandler {
  return (operation) => {
    return async (request) => {
      const todu = getTodu();
      if (!todu) {
        return createProtocolErrorFrame(
          request.id,
          createProtocolError("INTERNAL_ERROR", "Daemon runtime is not ready", {
            method: request.method,
          }),
        );
      }

      try {
        const result = await operation(request, todu);
        if (result.ok) {
          return createProtocolSuccessFrame(request.id, normalizeSuccessValue(result.value));
        }

        return createProtocolErrorFrame(request.id, result.error);
      } catch (error) {
        return createProtocolErrorFrame(request.id, error);
      }
    };
  };
}

function getRequiredStringParam(request: ProtocolRequestFrame, field: string): string {
  const value = request.params[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw createProtocolError(
      "BAD_REQUEST",
      `${request.method} requires params.${field} as a non-empty string`,
      { field },
    );
  }

  return value;
}

function getRequiredObjectParam<T extends object>(request: ProtocolRequestFrame, field: string): T {
  const value = request.params[field];
  if (!isRecord(value)) {
    throw createProtocolError("BAD_REQUEST", `${request.method} requires params.${field} object`, {
      field,
    });
  }

  return value as unknown as T;
}

function getOptionalObjectParam<T extends object>(
  request: ProtocolRequestFrame,
  field: string,
): T | undefined {
  const value = request.params[field];
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw createProtocolError("BAD_REQUEST", `${request.method} requires params.${field} object`, {
      field,
    });
  }

  return value as unknown as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeSuccessValue(value: unknown): unknown {
  if (value === undefined) {
    return null;
  }

  return value;
}

export function mergeNamespaceHandlerSets(
  base: DaemonRpcNamespaceHandlers,
  overrides: DaemonRpcNamespaceHandlers,
): DaemonRpcNamespaceHandlers {
  const merged: DaemonRpcNamespaceHandlers = {};
  const namespaceNames = new Set([...Object.keys(base), ...Object.keys(overrides)]);

  for (const namespaceName of namespaceNames) {
    const namespace = namespaceName as keyof DaemonRpcNamespaceHandlers;
    merged[namespace] = {
      ...(base[namespace] ?? {}),
      ...(overrides[namespace] ?? {}),
    };
  }

  return merged;
}
