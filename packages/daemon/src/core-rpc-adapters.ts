import {
  type CreateActorInput,
  type CreateHabitInput,
  type CreateIntegrationBindingInput,
  type CreateLabelInput,
  type CreateNoteInput,
  type CreateProjectInput,
  type CreateRecurringInput,
  type CreateTaskInput,
  createActorId,
  createHabitId,
  createIntegrationBindingId,
  createLabelId,
  createNoteId,
  createProjectId,
  createRecurringId,
  createTaskId,
  type HabitFilter,
  type IntegrationBindingFilter,
  type NoteFilter,
  ok,
  type ProjectFilter,
  type RecurringFilter,
  type Result,
  type TaskFilter,
  type TaskSortOptions,
  type ToduError,
  type UpdateHabitInput,
  type UpdateIntegrationBindingInput,
  type UpdateLabelInput,
  type UpdateNoteInput,
  type UpdateProjectInput,
  type UpdateRecurringInput,
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

export interface CreateCoreNamespaceHandlersOptions {
  getTodu: () => Todu | null;
}

export function createCoreNamespaceHandlers(
  options: CreateCoreNamespaceHandlersOptions,
): DaemonRpcNamespaceHandlers {
  const method = createMethodExecutor(options.getTodu);

  return {
    actor: {
      list: method(async (_request, todu) => {
        return todu.actor.list();
      }),
      create: method(async (request, todu) => {
        const rawInput = getRequiredObjectParam<{ id: string; displayName: string }>(
          request,
          "input",
        );
        const input: CreateActorInput = {
          id: createActorId(rawInput.id),
          displayName: rawInput.displayName,
        };
        return todu.actor.create(input);
      }),
      rename: method(async (request, todu) => {
        const id = createActorId(getRequiredStringParam(request, "id"));
        const displayName = getRequiredStringParam(request, "displayName");
        return todu.actor.rename(id, displayName);
      }),
      archive: method(async (request, todu) => {
        const id = createActorId(getRequiredStringParam(request, "id"));
        return todu.actor.archive(id);
      }),
      unarchive: method(async (request, todu) => {
        const id = createActorId(getRequiredStringParam(request, "id"));
        return todu.actor.unarchive(id);
      }),
    },
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
    integration: {
      create: method(async (request, todu) => {
        const input = getRequiredObjectParam<CreateIntegrationBindingInput>(request, "input");
        return todu.integration.create(input);
      }),
      list: method(async (request, todu) => {
        const filter = getOptionalObjectParam<IntegrationBindingFilter>(request, "filter");
        return todu.integration.list(filter);
      }),
      get: method(async (request, todu) => {
        const id = createIntegrationBindingId(getRequiredStringParam(request, "id"));
        return todu.integration.get(id);
      }),
      update: method(async (request, todu) => {
        const id = createIntegrationBindingId(getRequiredStringParam(request, "id"));
        const input = getRequiredObjectParam<UpdateIntegrationBindingInput>(request, "input");
        return todu.integration.update(id, input);
      }),
      delete: method(async (request, todu) => {
        const id = createIntegrationBindingId(getRequiredStringParam(request, "id"));
        return todu.integration.delete(id);
      }),
      status: method(async (request, todu) => {
        const id = createIntegrationBindingId(getRequiredStringParam(request, "id"));
        return todu.integration.getStatus(id);
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
    recurring: {
      create: method(async (request, todu) => {
        const input = getRequiredObjectParam<CreateRecurringInput>(request, "input");
        return todu.recurring.create(input);
      }),
      list: method(async (request, todu) => {
        const filter = getOptionalObjectParam<RecurringFilter>(request, "filter");
        return todu.recurring.list(filter);
      }),
      get: method(async (request, todu) => {
        const id = createRecurringId(getRequiredStringParam(request, "id"));
        return todu.recurring.get(id);
      }),
      update: method(async (request, todu) => {
        const id = createRecurringId(getRequiredStringParam(request, "id"));
        const input = getRequiredObjectParam<UpdateRecurringInput>(request, "input");
        return todu.recurring.update(id, input);
      }),
      delete: method(async (request, todu) => {
        const id = createRecurringId(getRequiredStringParam(request, "id"));
        return todu.recurring.delete(id);
      }),
      pause: method(async (request, todu) => {
        const id = createRecurringId(getRequiredStringParam(request, "id"));
        return todu.recurring.pause(id);
      }),
      resume: method(async (request, todu) => {
        const id = createRecurringId(getRequiredStringParam(request, "id"));
        return todu.recurring.resume(id);
      }),
      upcoming: method(async (request, todu) => {
        const rawOptions = getOptionalObjectParam<{ templateId?: string; days?: number }>(
          request,
          "options",
        );

        const options = rawOptions
          ? {
              ...rawOptions,
              templateId:
                rawOptions.templateId !== undefined
                  ? createRecurringId(rawOptions.templateId)
                  : undefined,
            }
          : undefined;

        return todu.recurring.upcoming(options);
      }),
      generate: method(async (request, todu) => {
        const templateId = createRecurringId(getRequiredStringParam(request, "templateId"));
        const date = getRequiredStringParam(request, "date");
        return todu.recurring.generate(templateId, date);
      }),
      process: method(async (_request, todu) => {
        return todu.recurring.process();
      }),
    },
    habit: {
      create: method(async (request, todu) => {
        const input = getRequiredObjectParam<CreateHabitInput>(request, "input");
        return todu.habit.create(input);
      }),
      list: method(async (request, todu) => {
        const filter = getOptionalObjectParam<HabitFilter>(request, "filter");
        return todu.habit.list(filter);
      }),
      get: method(async (request, todu) => {
        const id = createHabitId(getRequiredStringParam(request, "id"));
        return todu.habit.get(id);
      }),
      update: method(async (request, todu) => {
        const id = createHabitId(getRequiredStringParam(request, "id"));
        const input = getRequiredObjectParam<UpdateHabitInput>(request, "input");
        return todu.habit.update(id, input);
      }),
      delete: method(async (request, todu) => {
        const id = createHabitId(getRequiredStringParam(request, "id"));
        return todu.habit.delete(id);
      }),
      pause: method(async (request, todu) => {
        const id = createHabitId(getRequiredStringParam(request, "id"));
        return todu.habit.pause(id);
      }),
      resume: method(async (request, todu) => {
        const id = createHabitId(getRequiredStringParam(request, "id"));
        return todu.habit.resume(id);
      }),
      check: method(async (request, todu) => {
        const id = createHabitId(getRequiredStringParam(request, "id"));
        return todu.habit.check(id);
      }),
      uncheck: method(async (request, todu) => {
        const id = createHabitId(getRequiredStringParam(request, "id"));
        return todu.habit.uncheck(id);
      }),
      streak: method(async (request, todu) => {
        const id = createHabitId(getRequiredStringParam(request, "id"));
        return todu.habit.streak(id);
      }),
      history: method(async (request, todu) => {
        const id = createHabitId(getRequiredStringParam(request, "id"));
        const days = getOptionalNumberParam(request, "days");
        return todu.habit.history(id, days);
      }),
    },
    sync: {
      start: method(async (_request, todu) => {
        await todu.sync.start();
        return ok(undefined);
      }),
      stop: method(async (_request, todu) => {
        await todu.sync.stop();
        return ok(undefined);
      }),
      status: method(async (_request, todu) => {
        return ok(todu.sync.status());
      }),
      catalogId: method(async (_request, todu) => {
        return ok(todu.sync.getCatalogId());
      }),
    },
  };
}

// Kept for compatibility with previously merged code/tests.
export function createProjectTaskLabelNoteNamespaceHandlers(
  options: CreateCoreNamespaceHandlersOptions,
): DaemonRpcNamespaceHandlers {
  return createCoreNamespaceHandlers(options);
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

function getOptionalNumberParam(request: ProtocolRequestFrame, field: string): number | undefined {
  const value = request.params[field];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    throw createProtocolError(
      "BAD_REQUEST",
      `${request.method} requires params.${field} as a positive number`,
      { field },
    );
  }

  return Math.floor(value);
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
