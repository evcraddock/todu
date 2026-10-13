import { randomUUID } from "node:crypto";
import type {
  IntegrationBinding,
  SyncLocalTaskObservation,
  SyncLocalTaskQuery,
  SyncLocalTaskResolution,
  SyncProviderPullContext,
  SyncProviderPullResultV6,
  Task,
} from "@todu/core";
import type { Todu, ToduWithInternalTools } from "@todu/engine";

function matches(task: Task, query: SyncLocalTaskQuery): boolean {
  return (
    (query.localTaskId === undefined || task.id === query.localTaskId) &&
    (query.externalId === undefined || task.externalId === query.externalId) &&
    (query.sourceUrl === undefined || task.sourceUrl === query.sourceUrl)
  );
}

function resolve(
  tasks: readonly Task[],
  query: SyncLocalTaskQuery,
): SyncLocalTaskResolution | Task {
  if (!query || typeof query !== "object") return { state: "unknown", reason: "invalid-query" };
  const selectors = [query.localTaskId, query.externalId, query.sourceUrl].filter(
    (value) => value !== undefined,
  );
  if (
    selectors.length === 0 ||
    selectors.some((value) => typeof value !== "string" || !value.trim())
  )
    return { state: "unknown", reason: "invalid-query" };
  if (Object.keys(query).some((key) => !["localTaskId", "externalId", "sourceUrl"].includes(key)))
    return { state: "unknown", reason: "invalid-query" };
  const candidates = tasks.filter((task) => matches(task, query));
  if (candidates.length > 1) return { state: "ambiguous" };
  if (candidates.length === 0) {
    const partial = tasks.some(
      (task) =>
        (query.localTaskId !== undefined && task.id === query.localTaskId) ||
        (query.externalId !== undefined && task.externalId === query.externalId) ||
        (query.sourceUrl !== undefined && task.sourceUrl === query.sourceUrl),
    );
    return partial ? { state: "unknown", reason: "identity-mismatch" } : { state: "missing" };
  }
  const task = candidates[0];
  if (
    (task.externalId && tasks.filter((item) => item.externalId === task.externalId).length !== 1) ||
    (task.sourceUrl && tasks.filter((item) => item.sourceUrl === task.sourceUrl).length !== 1)
  )
    return { state: "ambiguous" };
  return task;
}

function observation(task: Task, token: string): SyncLocalTaskObservation {
  return Object.freeze({
    localTaskId: task.id,
    projectId: task.projectId,
    externalId: task.externalId,
    sourceUrl: task.sourceUrl,
    status: task.status,
    updatedAt: task.updatedAt,
    observationToken: token,
  });
}

async function listScopedTasks(todu: Todu, binding: IntegrationBinding): Promise<Task[]> {
  const result = await todu.task.list({ projectId: binding.projectId });
  if (!result.ok)
    throw new Error(
      `local task context unavailable for binding ${binding.id}: ${JSON.stringify(result.error)}`,
    );
  if (result.value.some((task) => task.projectId !== binding.projectId))
    throw new Error(`local task context scope mismatch for binding ${binding.id}`);
  return result.value.map((task) => ({ ...task }));
}

export interface LocalTaskPullGuard {
  context: SyncProviderPullContext;
  expire(): void;
  validate(pull: SyncProviderPullResultV6): void;
  verifyAndRun<T>(pull: SyncProviderPullResultV6, action: () => Promise<T>): Promise<T>;
}

/** Snapshot receipts authorize only declared cancellation exclusions, never mutations. */
export async function createLocalTaskPullGuard(params: {
  todu: Todu;
  binding: IntegrationBinding;
  isCurrentHost: () => boolean;
}): Promise<LocalTaskPullGuard> {
  const { todu, binding, isCurrentHost } = params;
  const tasks = await listScopedTasks(todu, binding);
  let active = true;
  const issued = new Map<string, SyncLocalTaskObservation>();
  const context: SyncProviderPullContext = Object.freeze({
    bindingId: binding.id,
    projectId: binding.projectId,
    observedAt: new Date().toISOString(),
    resolveTask(query: SyncLocalTaskQuery): SyncLocalTaskResolution {
      if (!active) return { state: "unknown", reason: "context-expired" };
      const result = resolve(tasks, query);
      if ("state" in result) return Object.freeze(result);
      const token = randomUUID();
      const task = observation(result, token);
      issued.set(token, task);
      return Object.freeze({ state: "found", task });
    },
  });

  function exclusions(pull: SyncProviderPullResultV6): SyncLocalTaskObservation[] {
    if (!Array.isArray(pull.cancelledTaskExclusions))
      throw new Error("sync provider v6 pull requires cancelledTaskExclusions");
    const seen = new Set<string>();
    return pull.cancelledTaskExclusions.map((exclusion) => {
      const expected = issued.get(exclusion?.observationToken);
      if (!expected || expected.status !== "canceled" || !expected.externalId)
        throw new Error(`invalid cancellation exclusion receipt for binding ${binding.id}`);
      if (seen.has(expected.localTaskId)) throw new Error("duplicate cancellation exclusion");
      seen.add(expected.localTaskId);
      return expected;
    });
  }

  function validate(pull: SyncProviderPullResultV6): void {
    const excluded = new Set(exclusions(pull).map((task) => task.externalId));
    if (!Array.isArray(pull.tasks) || !Array.isArray(pull.taskUpdates))
      throw new Error("sync provider v6 pull requires tasks and taskUpdates arrays");
    const referenced = [
      ...pull.tasks.map((task) => task.externalId),
      ...pull.taskUpdates.map((task) => task.externalId),
      ...(pull.comments ?? []).map((comment) => comment.externalTaskId),
      ...(pull.deletedComments ?? []).map((comment) => comment.externalTaskId),
      ...(pull.completeCommentExternalTaskIds ?? []),
    ];
    if (referenced.some((externalId) => excluded.has(externalId)))
      throw new Error("cancelled task exclusion conflicts with returned task/comment changes");
  }

  return {
    context,
    expire() {
      active = false;
    },
    validate,
    async verifyAndRun<T>(pull: SyncProviderPullResultV6, action: () => Promise<T>): Promise<T> {
      validate(pull);
      const currentBinding = await todu.integration.get(binding.id);
      if (
        !currentBinding.ok ||
        ["provider", "projectId", "targetKind", "targetRef", "enabled", "strategy"].some(
          (key) =>
            currentBinding.value[key as keyof IntegrationBinding] !==
            binding[key as keyof IntegrationBinding],
        )
      )
        throw new Error(`local task context binding changed: ${binding.id}`);
      const current = await listScopedTasks(todu, binding);
      if (!isCurrentHost()) throw new Error("local task context data host changed");
      for (const expected of exclusions(pull)) {
        const actual = resolve(current, {
          localTaskId: expected.localTaskId,
          externalId: expected.externalId,
          ...(expected.sourceUrl !== undefined ? { sourceUrl: expected.sourceUrl } : {}),
        });
        if (
          "state" in actual ||
          JSON.stringify(observation(actual, expected.observationToken)) !==
            JSON.stringify(expected)
        )
          throw new Error(
            `stale cancellation exclusion for task ${expected.localTaskId}; pull must reevaluate current local state`,
          );
      }
      let value: T;
      const result = await (
        todu as ToduWithInternalTools
      ).__internal.syncRuntime.withCurrentTaskLifecycle({
        binding,
        observations: exclusions(pull),
        isCurrentHost,
        async run() {
          value = await action();
        },
      });
      if (!result.ok)
        throw new Error(`local task context verification failed: ${JSON.stringify(result.error)}`);
      return value!;
    },
  };
}
