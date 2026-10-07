import {
  err,
  type IntegrationBindingId,
  isTaskPriority,
  isTaskStatus,
  ok,
  type Result,
  type TaskId,
  type TaskPriority,
  type TaskStatus,
  type ValidationError,
  validationError,
} from "./types.js";

export const SYNC_TASK_FIELD_GROUPS = [
  "content",
  "workflow",
  "classification",
  "assignment",
] as const;
export type SyncTaskFieldGroup = (typeof SYNC_TASK_FIELD_GROUPS)[number];

/** Stable provider identities only; actor resolution remains host-owned. */
export type SyncAssigneeIdentity =
  | { externalAccountId: string; externalLogin?: string }
  | { externalAccountId?: string; externalLogin: string };

export interface SyncTaskFieldGroupValues {
  content: { title: string; description: string };
  workflow: { status: TaskStatus };
  classification: { priority: TaskPriority; labels: string[] };
  assignment: { assignees: SyncAssigneeIdentity[] };
}

export interface SyncTaskFieldGroupInput<K extends SyncTaskFieldGroup> {
  /** Last value known to have been successfully mirrored on both sides. */
  base: SyncTaskFieldGroupValues[K];
  remote: SyncTaskFieldGroupValues[K];
  /** RFC 3339 source clock; only consulted for divergent two-sided changes. */
  sourceTimestamp?: string;
}

export interface SyncTaskFieldGroupUpdate {
  /** Canonical identity within the binding and project supplied to pull. */
  externalId: string;
  /** Optional identity assertion; the host must verify it against the durable link. */
  localTaskId?: TaskId;
  /** Omitted groups are unchanged; supplied groups contain complete values. */
  groups: { [K in SyncTaskFieldGroup]?: SyncTaskFieldGroupInput<K> };
}

export interface SyncTaskFieldGroupConflict<K extends SyncTaskFieldGroup> {
  bindingId: IntegrationBindingId;
  localTaskId: TaskId;
  externalId: string;
  group: K;
  localTimestamp?: string;
  remoteTimestamp?: string;
  /** Remote wins when either clock is missing or both clocks are equal. */
  selection: "newer-timestamp" | "remote-wins-equal-timestamps" | "remote-wins-missing-timestamp";
}

/** The selected value is not necessarily mirrored remotely yet. */
export type SyncTaskFieldGroupOutcome<K extends SyncTaskFieldGroup> = {
  value: SyncTaskFieldGroupValues[K];
} & (
  | { resolution: "unchanged" | "converged"; winner: "equal"; remoteWriteRequired: false }
  | { resolution: "local-only"; winner: "local"; remoteWriteRequired: true }
  | { resolution: "remote-only"; winner: "remote"; remoteWriteRequired: false }
  | {
      resolution: "conflict";
      winner: "local";
      remoteWriteRequired: true;
      conflict: SyncTaskFieldGroupConflict<K> & { selection: "newer-timestamp" };
    }
  | {
      resolution: "conflict";
      winner: "remote";
      remoteWriteRequired: false;
      conflict: SyncTaskFieldGroupConflict<K>;
    }
);

export interface SyncTaskFieldGroupResult {
  externalId: string;
  localTaskId: TaskId;
  groups: { [K in SyncTaskFieldGroup]?: SyncTaskFieldGroupOutcome<K> };
  /** Preserve remote assignment and its base if local actor mapping is incomplete. */
  deferred?: { assignment: "incomplete-assignment-mapping" };
}

export interface SyncProviderPullAcknowledgmentV5 {
  /** Exactly one result per returned field-group update, in the same order. */
  taskResults: SyncTaskFieldGroupResult[];
}

/** Validate normalized input shape, not task existence or reconciliation policy. */
export function validateSyncTaskFieldGroupUpdate(
  input: unknown,
): Result<SyncTaskFieldGroupUpdate, ValidationError> {
  if (!isRecord(input))
    return err(validationError("update", "Field-group update must be an object"));
  if (!isIdentity(input.externalId)) {
    return err(
      validationError("externalId", "Field-group update requires a non-empty external ID"),
    );
  }
  if (Object.hasOwn(input, "localTaskId") && !isIdentity(input.localTaskId)) {
    return err(
      validationError("localTaskId", "Local task identity must be non-empty when supplied"),
    );
  }
  if (!isRecord(input.groups) || Object.keys(input.groups).length === 0) {
    return err(
      validationError("groups", "Field-group update requires at least one complete group"),
    );
  }
  for (const [group, candidate] of Object.entries(input.groups)) {
    if (!SYNC_TASK_FIELD_GROUPS.includes(group as SyncTaskFieldGroup)) {
      return err(validationError(`groups.${group}`, `Unknown task field group: ${group}`));
    }
    if (!isRecord(candidate)) {
      return err(validationError(`groups.${group}`, `Task field group ${group} must be an object`));
    }
    for (const side of ["base", "remote"] as const) {
      if (!isGroupValue(group as SyncTaskFieldGroup, candidate[side])) {
        return err(
          validationError(
            `groups.${group}.${side}`,
            `Task field group ${group} requires a complete valid ${side} value`,
          ),
        );
      }
    }
    if (
      Object.hasOwn(candidate, "sourceTimestamp") &&
      !isSourceTimestamp(candidate.sourceTimestamp)
    ) {
      return err(
        validationError(
          `groups.${group}.sourceTimestamp`,
          `Task field group ${group} requires an RFC 3339 timestamp with timezone when supplied`,
        ),
      );
    }
  }
  return ok(input as unknown as SyncTaskFieldGroupUpdate);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIdentity(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSourceTimestamp(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(0);
  date.setUTCFullYear(Number(year), Number(month) - 1, Number(day));
  return (
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day) &&
    Number(hour) < 24 &&
    Number(minute) < 60 &&
    Number(second) < 60
  );
}

function isGroupValue(group: SyncTaskFieldGroup, value: unknown): boolean {
  if (!isRecord(value)) return false;
  switch (group) {
    case "content":
      return isIdentity(value.title) && typeof value.description === "string";
    case "workflow":
      return typeof value.status === "string" && isTaskStatus(value.status);
    case "classification":
      return (
        typeof value.priority === "string" &&
        isTaskPriority(value.priority) &&
        Array.isArray(value.labels) &&
        value.labels.every(isIdentity)
      );
    case "assignment":
      return Array.isArray(value.assignees) && value.assignees.every(isAssigneeIdentity);
  }
}

function isAssigneeIdentity(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (Object.hasOwn(value, "externalAccountId") && !isIdentity(value.externalAccountId))
    return false;
  if (Object.hasOwn(value, "externalLogin") && !isIdentity(value.externalLogin)) return false;
  return isIdentity(value.externalAccountId) || isIdentity(value.externalLogin);
}
