import {
  err,
  ok,
  type Result,
  type SyncAssigneeIdentity,
  type SyncTaskFieldGroup,
  type SyncTaskFieldGroupConflict,
  type SyncTaskFieldGroupInput,
  type SyncTaskFieldGroupOutcome,
  type SyncTaskFieldGroupValues,
  type ValidationError,
  validateISODate,
  validateSyncTaskFieldGroupUpdate,
} from "@todu/core";

/** Compare normalized values; providers/hosts project assignment aliases before comparison. */
export function syncTaskFieldGroupValuesEqual<K extends SyncTaskFieldGroup>(params: {
  group: K;
  left: SyncTaskFieldGroupValues[K];
  right: SyncTaskFieldGroupValues[K];
}): boolean {
  const { group, left, right } = params;
  const comparators: {
    [G in SyncTaskFieldGroup]: (
      a: SyncTaskFieldGroupValues[G],
      b: SyncTaskFieldGroupValues[G],
    ) => boolean;
  } = {
    content: (a, b) => a.title === b.title && a.description === b.description,
    workflow: (a, b) => a.status === b.status,
    classification: (a, b) => a.priority === b.priority && setsEqual(a.labels, b.labels),
    assignment: (a, b) => setsEqual(a.assignees.map(assigneeKey), b.assignees.map(assigneeKey)),
  };
  return comparators[group](left, right);
}

/** Pure three-way decision; application, authorization, and persistence are host-owned. */
export function reconcileSyncTaskFieldGroup<K extends SyncTaskFieldGroup>(
  params: {
    group: K;
    local: SyncTaskFieldGroupValues[K];
    input: SyncTaskFieldGroupInput<K>;
    localTimestamp?: string;
  } & Pick<SyncTaskFieldGroupConflict<K>, "bindingId" | "localTaskId" | "externalId">,
): Result<SyncTaskFieldGroupOutcome<K>, ValidationError> {
  const { group, local, input, localTimestamp } = params;
  for (const [field, clock] of [
    ["localTimestamp", localTimestamp],
    ["sourceTimestamp", input.sourceTimestamp],
  ] as const) {
    if (clock !== undefined) {
      const error = validateISODate(field, clock);
      if (error) return err(error);
    }
  }
  const validated = validateSyncTaskFieldGroupUpdate({
    externalId: params.externalId,
    localTaskId: params.localTaskId,
    groups: { [group]: input },
  });
  if (!validated.ok) return err(validated.error);
  const localChanged = !syncTaskFieldGroupValuesEqual({ group, left: local, right: input.base });
  const remoteChanged = !syncTaskFieldGroupValuesEqual({
    group,
    left: input.remote,
    right: input.base,
  });
  if (!localChanged && !remoteChanged) {
    return ok({
      value: local,
      resolution: "unchanged",
      winner: "equal",
      remoteWriteRequired: false,
    });
  }
  if (localChanged && !remoteChanged) {
    return ok({
      value: local,
      resolution: "local-only",
      winner: "local",
      remoteWriteRequired: true,
    });
  }
  if (!localChanged && remoteChanged) {
    return ok({
      value: input.remote,
      resolution: "remote-only",
      winner: "remote",
      remoteWriteRequired: false,
    });
  }
  if (syncTaskFieldGroupValuesEqual({ group, left: local, right: input.remote })) {
    return ok({
      value: local,
      resolution: "converged",
      winner: "equal",
      remoteWriteRequired: false,
    });
  }
  const conflict: SyncTaskFieldGroupConflict<K> = {
    bindingId: params.bindingId,
    localTaskId: params.localTaskId,
    externalId: params.externalId,
    group,
    ...(localTimestamp !== undefined ? { localTimestamp } : {}),
    ...(input.sourceTimestamp !== undefined ? { remoteTimestamp: input.sourceTimestamp } : {}),
    selection: "newer-timestamp",
  };
  if (localTimestamp === undefined || input.sourceTimestamp === undefined) {
    conflict.selection = "remote-wins-missing-timestamp";
  } else if (Date.parse(localTimestamp) === Date.parse(input.sourceTimestamp)) {
    conflict.selection = "remote-wins-equal-timestamps";
  } else if (Date.parse(localTimestamp) > Date.parse(input.sourceTimestamp)) {
    return ok({
      value: local,
      resolution: "conflict",
      winner: "local",
      remoteWriteRequired: true,
      conflict: { ...conflict, selection: "newer-timestamp" },
    });
  }
  return ok({
    value: input.remote,
    resolution: "conflict",
    winner: "remote",
    remoteWriteRequired: false,
    conflict,
  });
}

function setsEqual(left: string[], right: string[]): boolean {
  const a = new Set(left);
  const b = new Set(right);
  return a.size === b.size && [...a].every((value) => b.has(value));
}

function assigneeKey(identity: SyncAssigneeIdentity): string {
  return identity.externalAccountId !== undefined
    ? `account:${identity.externalAccountId.trim()}`
    : `login:${identity.externalLogin?.trim().toLowerCase()}`;
}
