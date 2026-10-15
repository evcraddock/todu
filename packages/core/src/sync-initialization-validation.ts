import {
  isSyncSourceTimestamp,
  isSyncTaskFieldGroupValue,
  SYNC_TASK_FIELD_GROUPS,
  type SyncTaskFieldGroup,
} from "./sync-field-groups.js";
import type { SyncTaskFieldGroupUpdateV7 } from "./sync-initialization.js";
import { err, ok, type Result, type ValidationError, validationError } from "./types.js";
import { validateDescription, validateTaskTitle } from "./validation.js";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function identity(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}

/** V7 is validated independently; unknown bases never enter the legacy v5 validator. */
export function validateSyncTaskFieldGroupUpdateV7(
  input: unknown,
): Result<SyncTaskFieldGroupUpdateV7, ValidationError> {
  const fail = (field: string, message: string) => err(validationError(field, message));
  if (!record(input)) return fail("update", "V7 update must be an object");
  if (
    Object.keys(input).some(
      (key) => !["externalId", "localTaskId", "observationToken", "groups"].includes(key),
    )
  )
    return fail("update", "Unknown v7 update field; operator intents are not pull payloads");
  if (!identity(input.externalId))
    return fail("externalId", "Canonical external identity required");
  if (Object.hasOwn(input, "localTaskId") && !identity(input.localTaskId))
    return fail("localTaskId", "Nonempty local identity required when supplied");
  if (!identity(input.observationToken))
    return fail("observationToken", "Fresh host observation required");
  if (!record(input.groups) || Object.keys(input.groups).length === 0)
    return fail("groups", "At least one group required");
  for (const [key, candidate] of Object.entries(input.groups)) {
    if (!SYNC_TASK_FIELD_GROUPS.includes(key as SyncTaskFieldGroup) || !record(candidate))
      return fail(`groups.${key}`, "Unknown or malformed group");
    if (
      Object.keys(candidate).some((field) => !["base", "remote", "sourceTimestamp"].includes(field))
    )
      return fail(`groups.${key}`, "Unknown group field");
    if (!record(candidate.base))
      return fail(`groups.${key}.base`, "Explicit baseline state required");
    const base = candidate.base;
    if (base.state === "unknown") {
      if (Object.keys(base).length !== 1)
        return fail(`groups.${key}.base`, "Unknown baseline cannot contain a value");
    } else if (base.state === "known") {
      if (
        Object.keys(base).some((field) => !["state", "value"].includes(field)) ||
        !isSyncTaskFieldGroupValue(key as SyncTaskFieldGroup, base.value)
      )
        return fail(`groups.${key}.base`, "Known baseline requires a complete value");
    } else return fail(`groups.${key}.base`, "Baseline must be known or unknown");
    if (!isSyncTaskFieldGroupValue(key as SyncTaskFieldGroup, candidate.remote))
      return fail(`groups.${key}.remote`, "Complete remote value required");
    if (key === "content") {
      for (const value of [candidate.remote, ...(base.state === "known" ? [base.value] : [])]) {
        const content = value as { title: string; description: string };
        if (
          validateTaskTitle(content.title) ||
          validateDescription(content.description) ||
          content.title !== content.title.trim() ||
          content.description !== content.description.trim()
        )
          return fail(
            "groups.content",
            "Canonical content must fit engine limits and normalization",
          );
      }
    }
    if (
      Object.hasOwn(candidate, "sourceTimestamp") &&
      !isSyncSourceTimestamp(candidate.sourceTimestamp)
    )
      return fail(`groups.${key}.sourceTimestamp`, "RFC 3339 source timestamp required");
  }
  return ok(input as unknown as SyncTaskFieldGroupUpdateV7);
}
