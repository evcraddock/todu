import crypto from "node:crypto";
import {
  type Actor,
  type ActorId,
  type CreateTaskInput,
  type ImportedTaskInput,
  type IntegrationBinding,
  type Project,
  type Result,
  SYNC_TASK_FIELD_GROUPS,
  type SyncAssigneeIdentity,
  type SyncLocalTaskQuery,
  type SyncObservedGroup,
  type SyncObservedGroups,
  type SyncPersistedGroupReceipt,
  type SyncProviderPullAcknowledgmentV7,
  type SyncProviderPullContext,
  type SyncProviderPullContextV7,
  type SyncProviderPullResultV7,
  type SyncTaskFieldGroup,
  type SyncTaskFieldGroupResult,
  type SyncTaskFieldGroupUpdate,
  type SyncTaskFieldGroupUpdateV7,
  type SyncTaskFieldGroupValues,
  type SyncTaskGroupsResolution,
  type SyncTaskPersistedReceipt,
  type TaskWithDetail,
  validateSyncTaskFieldGroupUpdateV7,
} from "@todu/core";
import {
  type SyncTaskStateGuard,
  syncTaskFieldGroupValuesEqual,
  type ToduWithInternalTools,
} from "@todu/engine";
import { type FieldGroupActors, prepareSyncFieldGroupPull } from "./sync-field-group-pull.js";

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`safe initialization failed: ${JSON.stringify(result.error)}`);
  return result.value;
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const nested of Object.values(value)) freeze(nested);
    Object.freeze(value);
  }
  return value;
}

export function observeSyncTaskGroups(
  task: TaskWithDetail,
  actors: FieldGroupActors,
): SyncObservedGroups {
  const assignment = actors.local(task);
  return {
    content:
      task.descriptionApproval?.state === "pendingApproval"
        ? { state: "deferred", reason: "pending-content-approval" }
        : { state: "known", value: { title: task.title, description: task.description ?? "" } },
    workflow: { state: "known", value: { status: task.status } },
    classification: {
      state: "known",
      value: { priority: task.priority, labels: [...new Set(task.labels)].sort() },
    },
    assignment: assignment
      ? { state: "known", value: actors.canonicalize(assignment) }
      : { state: "deferred", reason: "incomplete-assignment-mapping" },
  };
}

interface IssuedObservation {
  task: TaskWithDetail;
  guard: SyncTaskStateGuard;
}

export interface SyncInitializationPull {
  context: SyncProviderPullContextV7;
  expire(): void;
  prepare(pull: SyncProviderPullResultV7): Promise<SyncTaskFieldGroupUpdate[]>;
  applyBootstrap(): Promise<void>;
  beforeTask(task: TaskWithDetail): void;
  mutationGuard(task: TaskWithDetail): () => Result<void>;
  applied(task: TaskWithDetail): void;
  acknowledgment(results: SyncTaskFieldGroupResult[]): Promise<{
    value: SyncProviderPullAcknowledgmentV7;
    run(action: (ack: SyncProviderPullAcknowledgmentV7) => Promise<void>): Promise<void>;
  }>;
}

/** V7 coordination; canonical identity resolution remains owned by the v6 scoped context. */
export function createSyncInitializationPull(options: {
  todu: ToduWithInternalTools;
  context: SyncProviderPullContext;
  actors: FieldGroupActors;
  scope: () => { binding: IntegrationBinding; project: Project; actors: Actor[] };
  isCurrentHost: () => boolean;
  assignments: (
    value: SyncAssigneeIdentity[],
  ) => { actorIds: ActorId[]; assignees: string[] } | null;
}): SyncInitializationPull {
  const { todu, actors } = options;
  const tools = todu.__internal.syncRuntime;
  const issued = new Map<string, IssuedObservation>();
  const snapshots = new Map<string, TaskWithDetail>();
  const bootstrap = new Map<string, TaskWithDetail | undefined>();
  const assignmentDeferred = new Set<string>();
  const consumed = new Set<string>();
  let active = true;
  let pull: SyncProviderPullResultV7 | null = null;
  const capture = async (tasks: TaskWithDetail[]) =>
    unwrap(
      await tools.captureTaskState({
        ...options.scope(),
        tasks,
        isCurrentHost: options.isCurrentHost,
      }),
    );
  const findIssued = (update: SyncTaskFieldGroupUpdateV7): IssuedObservation => {
    const observation = issued.get(update.observationToken);
    if (
      !observation ||
      observation.task.externalId !== update.externalId ||
      (update.localTaskId !== undefined && observation.task.id !== update.localTaskId)
    )
      throw new Error("Foreign, expired or contradictory v7 observation token");
    return observation;
  };
  const context: SyncProviderPullContextV7 = Object.freeze({
    ...options.context,
    async observeTaskGroups(query: SyncLocalTaskQuery): Promise<SyncTaskGroupsResolution> {
      if (!active) return { state: "unknown", reason: "context-expired" };
      const resolved = options.context.resolveTask(query);
      if (resolved.state !== "found") return resolved;
      if (!resolved.task.externalId) return { state: "unknown", reason: "identity-mismatch" };
      const task = unwrap(await todu.task.get(resolved.task.localTaskId));
      if (!active) return { state: "unknown", reason: "context-expired" };
      if (
        task.externalId !== resolved.task.externalId ||
        task.sourceUrl !== resolved.task.sourceUrl ||
        task.projectId !== options.scope().binding.projectId
      )
        return { state: "unknown", reason: "identity-mismatch" };
      const guard = await capture([task]);
      if (!active) return { state: "unknown", reason: "context-expired" };
      const token = crypto.randomUUID();
      issued.set(token, { task, guard });
      return freeze({
        state: "found",
        task: {
          localTaskId: task.id,
          externalId: task.externalId,
          sourceUrl: task.sourceUrl,
          updatedAt: task.updatedAt,
          observationToken: token,
          groups: observeSyncTaskGroups(task, actors),
        },
      });
    },
  });
  function requirePull(): SyncProviderPullResultV7 {
    if (!pull) throw new Error("Initialization pull was not prepared");
    return pull;
  }
  return {
    context,
    expire() {
      active = false;
    },
    async prepare(candidate) {
      if (pull) throw new Error("Initialization pull already prepared");
      if (
        !candidate ||
        !Array.isArray(candidate.taskUpdates) ||
        Object.keys(candidate).some(
          (key) =>
            ![
              "tasks",
              "taskUpdates",
              "comments",
              "deletedComments",
              "completeCommentExternalTaskIds",
              "checkpoint",
              "cancelledTaskExclusions",
            ].includes(key),
        )
      )
        throw new Error("Invalid v7 pull payload; operator intent is not a pull capability");
      const known: SyncTaskFieldGroupUpdate[] = [];
      const seen = new Set<string>();
      for (const update of candidate.taskUpdates) {
        unwrap(validateSyncTaskFieldGroupUpdateV7(update));
        if (seen.has(update.externalId)) throw new Error("Duplicate v7 update identity");
        seen.add(update.externalId);
        const observation = findIssued(update);
        unwrap(observation.guard.verify());
        snapshots.set(update.externalId, observation.task);
        const groups: SyncTaskFieldGroupUpdate["groups"] = {};
        for (const group of SYNC_TASK_FIELD_GROUPS) {
          const input = update.groups[group];
          if (!input) continue;
          if (
            group === "assignment" &&
            (!options.assignments(update.groups.assignment!.remote.assignees) ||
              (update.groups.assignment!.base.state === "known" &&
                !options.assignments(update.groups.assignment!.base.value.assignees)))
          ) {
            assignmentDeferred.add(update.externalId);
            continue;
          }
          if (input.base.state === "known") {
            // The public v5 contract sees only genuinely known bases, never synthesized history.
            Object.assign(groups, {
              [group]: {
                base: input.base.value,
                remote: input.remote,
                ...(input.sourceTimestamp !== undefined
                  ? { sourceTimestamp: input.sourceTimestamp }
                  : {}),
              },
            });
          }
        }
        if (Object.keys(groups).length)
          known.push({ externalId: update.externalId, localTaskId: observation.task.id, groups });
      }
      await prepareSyncFieldGroupPull({
        todu,
        ...options.scope(),
        pull: { ...candidate, taskUpdates: known },
      });
      const tasks = unwrap(await todu.task.list({ projectId: options.scope().binding.projectId }));
      for (const task of candidate.tasks) {
        if (seen.has(task.externalId)) throw new Error("Bootstrap/update identities overlap");
        seen.add(task.externalId);
        const matches = tasks.filter((row) => row.externalId === task.externalId);
        if (matches.length > 1) throw new Error("Ambiguous bootstrap identity");
        if (
          task.sourceUrl &&
          tasks.some(
            (row) => row.sourceUrl === task.sourceUrl && row.externalId !== task.externalId,
          )
        )
          throw new Error("Contradictory bootstrap source identity");
        if (matches[0]) {
          const existing = unwrap(await todu.task.get(matches[0].id));
          if (task.sourceUrl !== undefined && task.sourceUrl !== existing.sourceUrl)
            throw new Error("Bootstrap must not relink an existing identity");
          bootstrap.set(task.externalId, existing);
          snapshots.set(task.externalId, existing);
        } else bootstrap.set(task.externalId, undefined);
      }
      // Validate the entire observation window before any local application.
      for (const update of candidate.taskUpdates) unwrap(findIssued(update).guard.verify());
      await capture([...snapshots.values()]);
      pull = candidate;
      return known;
    },
    async applyBootstrap() {
      for (const row of requirePull().tasks) {
        const existing = bootstrap.get(row.externalId);
        if (existing) continue; // Existing values are observed, never replaced to manufacture a base.
        const scope = options.scope();
        const guard = await capture([...snapshots.values()]);
        const assignment = options.assignments((row.assignees ?? []) as SyncAssigneeIdentity[]);
        if (!assignment) assignmentDeferred.add(row.externalId);
        const input: CreateTaskInput = {
          projectId: scope.project.id,
          title: row.title,
          externalId: row.externalId,
          status: row.status,
          priority: row.priority,
          labels: row.labels,
          description: row.description,
          descriptionApproval:
            row.description !== undefined
              ? {
                  state: "pendingApproval",
                  sourceBindingId: scope.binding.id,
                }
              : undefined,
          assigneeActorIds: assignment?.actorIds ?? [],
          assignees: assignment?.assignees ?? [],
          sourceUrl: row.sourceUrl,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        };
        const created = unwrap(
          await tools.tasks.createIfUnlinked({ input, validateContext: guard.verifyScope }),
        );
        snapshots.set(row.externalId, created);
      }
    },
    beforeTask(task) {
      const update = requirePull().taskUpdates.find((row) => row.externalId === task.externalId);
      if (!update) throw new Error("Unexpected v7 application identity");
      unwrap(findIssued(update).guard.verifyValues());
    },
    mutationGuard(task) {
      const update = requirePull().taskUpdates.find((row) => row.externalId === task.externalId);
      if (!update) throw new Error("Unexpected v7 mutation identity");
      const guard = findIssued(update).guard;
      return () => {
        const checked = consumed.has(update.externalId)
          ? guard.verifyScope()
          : guard.verifyValues();
        if (checked.ok) consumed.add(update.externalId);
        return checked;
      };
    },
    applied(task) {
      snapshots.set(task.externalId!, task);
    },
    async acknowledgment(results) {
      const current = requirePull();
      const guard = await capture([...snapshots.values()]);
      const receipt = <K extends SyncTaskFieldGroup>(params: {
        group: K;
        task: TaskWithDetail;
        remote?: SyncTaskFieldGroupValues[K];
        known?: SyncTaskFieldGroupResult;
        externalId: string;
      }): SyncPersistedGroupReceipt<K> => {
        const { group, task, remote, known, externalId } = params;
        const observed = observeSyncTaskGroups(task, actors)[group] as SyncObservedGroup<K>;
        if (group === "assignment" && assignmentDeferred.has(externalId))
          return { state: "deferred", reason: "incomplete-assignment-mapping" };
        if (observed.state === "deferred") return observed;
        if (
          remote !== undefined &&
          syncTaskFieldGroupValuesEqual({ group, left: observed.value, right: remote })
        )
          return {
            state: "persisted",
            value: observed.value,
            baseline: "mirrored",
            remoteWriteRequired: false,
          };
        if (known?.groups[group]?.remoteWriteRequired)
          return {
            state: "persisted",
            value: observed.value,
            baseline: "unproven",
            remoteWriteRequired: true,
            reason: "remote-write-required",
          };
        return {
          state: "persisted",
          value: observed.value,
          baseline: "unproven",
          remoteWriteRequired: false,
          reason: remote === undefined ? "remote-value-unknown" : "initialization-disagreement",
        };
      };
      const taskResults = current.taskUpdates.map((update) => {
        const task = snapshots.get(update.externalId)!;
        const groups: SyncTaskPersistedReceipt["groups"] = {};
        for (const group of SYNC_TASK_FIELD_GROUPS) {
          const input = update.groups[group];
          if (input)
            Object.assign(groups, {
              [group]: receipt({
                group,
                task,
                remote: input.remote,
                known: results.find((row) => row.externalId === update.externalId),
                externalId: update.externalId,
              }),
            });
        }
        return { externalId: update.externalId, localTaskId: task.id, groups };
      });
      const bootstrapResults = current.tasks.map((row) => {
        const task = snapshots.get(row.externalId)!;
        const groups: SyncTaskPersistedReceipt["groups"] = {};
        const remote = bootstrapGroups(row);
        for (const group of SYNC_TASK_FIELD_GROUPS)
          Object.assign(groups, {
            [group]: receipt({ group, task, remote: remote[group], externalId: row.externalId }),
          });
        return { externalId: row.externalId, localTaskId: task.id, groups };
      });
      const value = { bootstrapResults, taskResults };
      return {
        value,
        async run(action) {
          unwrap(await guard.verifyAndRun(() => action(value)));
        },
      };
    },
  };
}

function bootstrapGroups(row: ImportedTaskInput): Partial<SyncTaskFieldGroupValues> {
  return {
    ...(row.description !== undefined
      ? { content: { title: row.title, description: row.description } }
      : {}),
    ...(row.status !== undefined ? { workflow: { status: row.status } } : {}),
    ...(row.priority !== undefined && row.labels !== undefined
      ? { classification: { priority: row.priority, labels: row.labels } }
      : {}),
    ...(row.assignees !== undefined
      ? { assignment: { assignees: row.assignees as SyncAssigneeIdentity[] } }
      : {}),
  };
}
