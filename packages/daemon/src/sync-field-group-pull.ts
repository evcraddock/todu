import {
  type ActorId,
  type ImportedTaskInput,
  type IntegrationBinding,
  type Project,
  SYNC_TASK_FIELD_GROUPS,
  type SyncAssigneeIdentity,
  type SyncProviderPullResultV5,
  type SyncTaskFieldGroup,
  type SyncTaskFieldGroupInput,
  type SyncTaskFieldGroupOutcome,
  type SyncTaskFieldGroupResult,
  type SyncTaskFieldGroupUpdate,
  type SyncTaskFieldGroupValues,
  type Task,
  type TaskWithDetail,
  type UpdateTaskInput,
  validateCreateTaskInput,
  validateDescription,
  validateISODate,
  validateSyncTaskFieldGroupUpdate,
  validateTaskTitle,
} from "@todu/core";
import {
  reconcileSyncTaskFieldGroup,
  type SyncContentRecovery,
  syncTaskFieldGroupValuesEqual,
  type ToduWithInternalTools,
} from "@todu/engine";
import type { DaemonLogger } from "./logger.js";

export interface FieldGroupActors {
  local(task: Task): SyncTaskFieldGroupValues["assignment"] | null;
  canonicalize(
    value: SyncTaskFieldGroupValues["assignment"],
  ): SyncTaskFieldGroupValues["assignment"];
  import(assignees: SyncAssigneeIdentity[]): Promise<{ actorIds: ActorId[]; assignees: string[] }>;
}

/** Validate identities and normalized task payloads before any task application. */
export async function prepareSyncFieldGroupPull(params: {
  todu: ToduWithInternalTools;
  binding: IntegrationBinding;
  project: Project;
  pull: SyncProviderPullResultV5;
}): Promise<void> {
  const { todu, pull, project } = params;
  if (
    !pull ||
    !Array.isArray(pull.tasks) ||
    !Array.isArray(pull.taskUpdates) ||
    !Object.hasOwn(pull, "checkpoint")
  ) {
    throw new Error("sync provider v5 pull requires tasks, taskUpdates arrays and a checkpoint");
  }
  for (const field of ["comments", "deletedComments", "completeCommentExternalTaskIds"] as const) {
    if (pull[field] !== undefined && !Array.isArray(pull[field]))
      throw new Error(`sync provider v5 pull requires ${field} to be an array`);
  }
  validateCommentPayloads(pull);
  const list = await todu.task.list({ projectId: project.id });
  if (!list.ok) throw new Error(`field-group task list failed: ${JSON.stringify(list.error)}`);
  const byExternal = new Map<string, Task[]>();
  for (const task of list.value) {
    if (task.externalId)
      byExternal.set(task.externalId, [...(byExternal.get(task.externalId) ?? []), task]);
  }
  const seen = new Set<string>();
  for (const task of pull.tasks) {
    validateBootstrapTask(task, project);
    if (seen.has(task.externalId))
      throw new Error(`duplicate v5 task identity: ${task.externalId}`);
    seen.add(task.externalId);
    const matches = byExternal.get(task.externalId) ?? [];
    if (matches.length > 1) throw new Error(`ambiguous v5 bootstrap identity: ${task.externalId}`);
    if (
      matches.length === 1 &&
      (task.updatedAt === undefined ||
        Date.parse(task.updatedAt) > Date.parse(matches[0].updatedAt))
    ) {
      throw new Error(
        `v5 linked task requires taskUpdates, not whole-task replacement: ${task.externalId}`,
      );
    }
  }
  for (const update of pull.taskUpdates) {
    const validated = validateSyncTaskFieldGroupUpdate(update);
    if (!validated.ok)
      throw new Error(`invalid field-group update: ${JSON.stringify(validated.error)}`);
    if (update.externalId !== update.externalId.trim())
      throw new Error(`non-canonical field-group external ID: ${update.externalId}`);
    validateCanonicalContent(update.groups.content);
    if (seen.has(update.externalId))
      throw new Error(`duplicate v5 task identity: ${update.externalId}`);
    seen.add(update.externalId);
    const matches = byExternal.get(update.externalId) ?? [];
    if (
      matches.length !== 1 ||
      (update.localTaskId !== undefined && update.localTaskId !== matches[0].id)
    ) {
      throw new Error(
        `missing, ambiguous or contradictory field-group identity: ${update.externalId}`,
      );
    }
  }
}

function validateCommentPayloads(pull: SyncProviderPullResultV5): void {
  for (const id of pull.completeCommentExternalTaskIds ?? []) {
    if (typeof id !== "string" || !id.trim())
      throw new Error("invalid v5 complete-comment task identity");
  }
  for (const [kind, rows] of [
    ["comments", pull.comments ?? []],
    ["deletedComments", pull.deletedComments ?? []],
  ] as const) {
    for (const row of rows) {
      if (
        !row ||
        typeof row.externalId !== "string" ||
        !row.externalId.trim() ||
        typeof row.externalTaskId !== "string" ||
        !row.externalTaskId.trim()
      )
        throw new Error(`invalid v5 ${kind} identity`);
      if (kind === "comments") {
        const comment = row as NonNullable<SyncProviderPullResultV5["comments"]>[number];
        if (typeof comment.body !== "string" || typeof comment.createdAt !== "string")
          throw new Error("invalid v5 comment body/creation timestamp");
        const createdError = validateISODate("createdAt", comment.createdAt);
        if (createdError) throw new Error(JSON.stringify(createdError));
        if (
          comment.author !== undefined &&
          (!comment.author ||
            typeof comment.author !== "object" ||
            Array.isArray(comment.author) ||
            [
              comment.author.externalAccountId,
              comment.author.externalLogin,
              comment.author.displayName,
            ].some((field) => field !== undefined && typeof field !== "string"))
        )
          throw new Error("invalid v5 comment author");
        if (
          comment.updatedAt !== undefined &&
          (typeof comment.updatedAt !== "string" || validateISODate("updatedAt", comment.updatedAt))
        )
          throw new Error("invalid v5 comment update timestamp");
      } else {
        const deletion = row as NonNullable<SyncProviderPullResultV5["deletedComments"]>[number];
        if (
          deletion.deletedAt !== undefined &&
          (typeof deletion.deletedAt !== "string" ||
            validateISODate("deletedAt", deletion.deletedAt))
        )
          throw new Error("invalid v5 comment deletion timestamp");
      }
    }
  }
}

function validateBootstrapTask(task: ImportedTaskInput, project: Project): void {
  if (
    !task ||
    typeof task.externalId !== "string" ||
    !task.externalId.trim() ||
    task.externalId !== task.externalId.trim() ||
    typeof task.title !== "string"
  )
    throw new Error("invalid v5 bootstrap task identity/title");
  for (const field of ["description", "sourceUrl", "createdAt", "updatedAt"] as const) {
    if (task[field] !== undefined && typeof task[field] !== "string")
      throw new Error(`invalid v5 bootstrap ${field}: ${task.externalId}`);
  }
  if (
    task.labels !== undefined &&
    (!Array.isArray(task.labels) || task.labels.some((label) => typeof label !== "string"))
  )
    throw new Error(`invalid v5 bootstrap labels: ${task.externalId}`);
  if (
    task.assignees !== undefined &&
    (!Array.isArray(task.assignees) ||
      task.assignees.some(
        (actor) =>
          !actor ||
          typeof actor !== "object" ||
          Array.isArray(actor) ||
          [actor.externalAccountId, actor.externalLogin, actor.displayName].some(
            (value) => value !== undefined && typeof value !== "string",
          ),
      ))
  )
    throw new Error(`invalid v5 bootstrap assignees: ${task.externalId}`);
  const error = validateCreateTaskInput({
    title: task.title,
    projectId: project.id,
    description: task.description,
    status: task.status,
    priority: task.priority,
    labels: task.labels,
    sourceUrl: task.sourceUrl,
    externalId: task.externalId,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  });
  if (error)
    throw new Error(`invalid v5 bootstrap task: ${task.externalId} ${JSON.stringify(error)}`);
}

function validateCanonicalContent(content: SyncTaskFieldGroupInput<"content"> | undefined): void {
  if (!content) return;
  for (const value of [content.base, content.remote]) {
    const error = validateTaskTitle(value.title) ?? validateDescription(value.description);
    if (
      error ||
      value.title !== value.title.trim() ||
      value.description !== value.description.trim()
    )
      throw new Error(
        "v5 content values must fit task limits and use the engine's trimmed title/body normalization",
      );
  }
}

export async function applySyncFieldGroupUpdates(params: {
  todu: ToduWithInternalTools;
  binding: IntegrationBinding;
  updates: SyncTaskFieldGroupUpdate[];
  actors: FieldGroupActors;
  logger: DaemonLogger;
}): Promise<SyncTaskFieldGroupResult[]> {
  const { todu, binding, actors, logger } = params;
  const recovery = todu.__internal.syncRuntime.contentRecovery;
  const loaded = await recovery.read(binding.id);
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.error));
  let records = loaded.value;
  const results: SyncTaskFieldGroupResult[] = [];
  for (const update of params.updates) {
    let local = await readLinkedTask({ todu, binding, update });
    let contentTimestamp: string | undefined = local.updatedAt;
    const pending = records.find(
      (row) => row.localTaskId === local.id && row.externalId === update.externalId,
    );
    if (
      update.groups.content &&
      pending &&
      isPartialRecoveryContent(local, pending) &&
      local.updatedAt !== pending.localTimestamp
    ) {
      throw new Error(
        `interrupted content has an intervening edit with ambiguous provenance: task=${local.id}; resolve the content before retrying`,
      );
    }
    if (update.groups.content && pending && canResumeContent(local, pending)) {
      local = await applyContent({ todu, task: local, selected: pending.after, binding });
      contentTimestamp = pending.sourceTimestamp;
    }
    const result: SyncTaskFieldGroupResult = {
      externalId: update.externalId,
      localTaskId: local.id,
      groups: {},
    };
    const patch: UpdateTaskInput = {};
    for (const group of SYNC_TASK_FIELD_GROUPS) {
      const input = update.groups[group];
      if (!input) continue;
      if (group === "assignment") {
        const localAssignment = actors.local(local);
        if (!localAssignment) {
          result.deferred = { assignment: "incomplete-assignment-mapping" };
          logger.warn("sync field-group assignment deferred", {
            bindingId: binding.id,
            taskId: local.id,
            externalId: update.externalId,
            group,
          });
          continue;
        }
        const outcome = decide({
          binding,
          update,
          local,
          group,
          value: actors.canonicalize(localAssignment),
          input: {
            ...update.groups.assignment!,
            base: actors.canonicalize(update.groups.assignment!.base),
            remote: actors.canonicalize(update.groups.assignment!.remote),
          },
          logger,
        });
        result.groups.assignment = outcome;
        if (outcome.winner === "remote") {
          const imported = await actors.import(outcome.value.assignees);
          patch.assigneeActorIds = imported.actorIds;
          patch.assignees = imported.assignees;
        }
      } else if (group === "content") {
        const outcome = decide({
          binding,
          update,
          local,
          group,
          value: contentValue(local),
          input: update.groups.content!,
          logger,
          localTimestamp: contentTimestamp,
        });
        result.groups.content = outcome;
        if (outcome.winner === "remote") {
          records = records.filter((row) => row.localTaskId !== local.id);
          records.push({
            localTaskId: local.id,
            externalId: update.externalId,
            before: contentValue(local),
            after: outcome.value,
            localTimestamp: local.updatedAt,
            ...(update.groups.content!.sourceTimestamp !== undefined
              ? { sourceTimestamp: update.groups.content!.sourceTimestamp }
              : {}),
          });
          const saved = await recovery.write(binding.id, records);
          if (!saved.ok) throw new Error(JSON.stringify(saved.error));
          local = await applyContent({ todu, task: local, selected: outcome.value, binding });
        }
      } else if (group === "workflow") {
        const outcome = decide({
          binding,
          update,
          local,
          group,
          value: { status: local.status },
          input: update.groups.workflow!,
          logger,
        });
        result.groups.workflow = outcome;
        if (outcome.winner === "remote") patch.status = outcome.value.status;
      } else {
        const outcome = decide({
          binding,
          update,
          local,
          group,
          value: { priority: local.priority, labels: local.labels },
          input: update.groups.classification!,
          logger,
        });
        result.groups.classification = outcome;
        if (outcome.winner === "remote") {
          patch.priority = outcome.value.priority;
          patch.labels = outcome.value.labels;
        }
      }
    }
    if (Object.keys(patch).length > 0) {
      const applied = await todu.__internal.syncRuntime.tasks.updateIfCurrent({
        id: local.id,
        input: patch,
        expected: local,
      });
      if (!applied.ok)
        throw new Error(
          `field-group task update failed: task=${local.id} ${JSON.stringify(applied.error)}`,
        );
    }
    results.push(result);
  }
  return results;
}

function decide<K extends SyncTaskFieldGroup>(params: {
  binding: IntegrationBinding;
  update: SyncTaskFieldGroupUpdate;
  local: TaskWithDetail;
  group: K;
  value: SyncTaskFieldGroupValues[K];
  input: SyncTaskFieldGroupInput<K>;
  logger: DaemonLogger;
  localTimestamp?: string;
}): SyncTaskFieldGroupOutcome<K> {
  const decision = reconcileSyncTaskFieldGroup({
    bindingId: params.binding.id,
    localTaskId: params.local.id,
    externalId: params.update.externalId,
    group: params.group,
    local: params.value,
    input: params.input,
    localTimestamp: Object.hasOwn(params, "localTimestamp")
      ? params.localTimestamp
      : params.local.updatedAt,
  });
  if (!decision.ok)
    throw new Error(
      `field-group reconciliation failed: task=${params.local.id} group=${params.group} ${JSON.stringify(decision.error)}`,
    );
  if (decision.value.resolution === "conflict")
    params.logger.warn("sync field-group conflict", {
      ...decision.value.conflict,
      taskId: params.local.id,
      winner: decision.value.winner,
    });
  return decision.value;
}

async function readLinkedTask(params: {
  todu: ToduWithInternalTools;
  binding: IntegrationBinding;
  update: Pick<SyncTaskFieldGroupUpdate, "externalId" | "localTaskId">;
}): Promise<TaskWithDetail> {
  const { todu, binding, update } = params;
  const list = await todu.task.list({ projectId: binding.projectId });
  if (!list.ok) throw new Error(`field-group task list failed: ${JSON.stringify(list.error)}`);
  const matches = list.value.filter((task) => task.externalId === update.externalId);
  if (
    matches.length !== 1 ||
    (update.localTaskId !== undefined && update.localTaskId !== matches[0].id)
  )
    throw new Error(`field-group task identity changed: ${update.externalId}`);
  const detail = await todu.task.get(matches[0].id);
  if (!detail.ok)
    throw new Error(`field-group task detail failed: ${JSON.stringify(detail.error)}`);
  if (detail.value.projectId !== binding.projectId || detail.value.externalId !== update.externalId)
    throw new Error(`field-group task linkage changed: ${update.externalId}`);
  return detail.value;
}

function contentValue(task: TaskWithDetail): SyncTaskFieldGroupValues["content"] {
  return { title: task.title, description: task.description ?? "" };
}

function isPartialRecoveryContent(task: TaskWithDetail, pending: SyncContentRecovery): boolean {
  const current = contentValue(task);
  return (
    [pending.before.title, pending.after.title].includes(current.title) &&
    [pending.before.description, pending.after.description].includes(current.description) &&
    !syncTaskFieldGroupValuesEqual({ group: "content", left: current, right: pending.before }) &&
    !syncTaskFieldGroupValuesEqual({ group: "content", left: current, right: pending.after })
  );
}

function canResumeContent(task: TaskWithDetail, pending: SyncContentRecovery): boolean {
  const current = contentValue(task);
  return (
    task.updatedAt === pending.localTimestamp &&
    [pending.before.title, pending.after.title].includes(current.title) &&
    [pending.before.description, pending.after.description].includes(current.description)
  );
}

async function applyContent(params: {
  todu: ToduWithInternalTools;
  task: TaskWithDetail;
  selected: SyncTaskFieldGroupValues["content"];
  binding: IntegrationBinding;
}): Promise<TaskWithDetail> {
  const { todu, task, selected, binding } = params;
  const patch: UpdateTaskInput = {};
  if (task.title !== selected.title) patch.title = selected.title;
  if ((task.description ?? "") !== selected.description) {
    patch.description = selected.description;
    patch.descriptionApproval = { state: "pendingApproval", sourceBindingId: binding.id };
  }
  if (Object.keys(patch).length === 0) return task;
  const result = await todu.__internal.syncRuntime.tasks.updateIfCurrent({
    id: task.id,
    input: patch,
    expected: task,
  });
  if (!result.ok)
    throw new Error(
      `field-group content update failed: task=${task.id} ${JSON.stringify(result.error)}`,
    );
  return result.value;
}

/** Never report a winning value which changed during application or the flush barrier. */
export async function verifySyncFieldGroupResults(params: {
  todu: ToduWithInternalTools;
  binding: IntegrationBinding;
  results: SyncTaskFieldGroupResult[];
  actors: FieldGroupActors;
}): Promise<void> {
  for (const result of params.results) {
    const task = await readLinkedTask({
      todu: params.todu,
      binding: params.binding,
      update: result,
    });
    const values: SyncTaskFieldGroupValues = {
      content: contentValue(task),
      workflow: { status: task.status },
      classification: { priority: task.priority, labels: task.labels },
      assignment: params.actors.local(task) ?? { assignees: [] },
    };
    for (const group of SYNC_TASK_FIELD_GROUPS) {
      const outcome = result.groups[group];
      if (
        outcome &&
        ((group === "assignment" && !params.actors.local(task)) ||
          !syncTaskFieldGroupValuesEqual({ group, left: values[group], right: outcome.value }))
      )
        throw new Error(
          `field-group winning value changed before acknowledgment: task=${task.id} group=${group}`,
        );
    }
  }
}

export async function clearAcknowledgedContentRecovery(params: {
  todu: ToduWithInternalTools;
  binding: IntegrationBinding;
  results: SyncTaskFieldGroupResult[];
}): Promise<void> {
  const { todu, binding, results } = params;
  const store = todu.__internal.syncRuntime.contentRecovery;
  const existing = await store.read(binding.id);
  if (!existing.ok) throw new Error(JSON.stringify(existing.error));
  const ids = new Set(
    results
      .filter((result) => result.groups.content !== undefined)
      .map((result) => result.localTaskId),
  );
  const cleared = await store.write(
    binding.id,
    existing.value.filter((row) => !ids.has(row.localTaskId)),
  );
  if (!cleared.ok) throw new Error(JSON.stringify(cleared.error));
}
