import { randomBytes } from "node:crypto";
import type { DocHandle, DocumentId, Repo } from "@automerge/automerge-repo";
import {
  type CatalogDocument,
  type ConfirmSyncWorkflowIntentInput,
  err,
  type IntegrationBinding,
  type IntegrationRegistryDocument,
  isTaskStatus,
  ok,
  type PrepareSyncWorkflowIntentInput,
  type ProjectId,
  type Result,
  type SyncWorkflowIntentPreview,
  type SyncWorkflowIntentReceipt,
  storageError,
  type Task,
  type TaskDetailDocument,
  type TaskListDocument,
  validationError,
} from "@todu/core";

export interface SyncWorkflowIntentTools {
  prepare(input: PrepareSyncWorkflowIntentInput): Promise<Result<SyncWorkflowIntentPreview>>;
  confirm(input: ConfirmSyncWorkflowIntentInput): Promise<Result<SyncWorkflowIntentReceipt>>;
}

interface LoadedScope {
  registryId: string;
  projectId: ProjectId;
  listId: string;
  detailId: string | undefined;
  registry: DocHandle<IntegrationRegistryDocument>;
  list: DocHandle<TaskListDocument>;
  detail: DocHandle<TaskDetailDocument> | undefined;
}

interface Heads {
  catalog: string;
  registry: string;
  list: string;
  detail: string | undefined;
}

interface PendingIntent {
  input: PrepareSyncWorkflowIntentInput;
  scope: LoadedScope;
  heads: Heads;
  expiresAt: number;
}

const TOKEN_LIFETIME_MS = 5 * 60 * 1000;

function invalid(message: string): Result<never> {
  return err(validationError("workflowIntent", `${message}; prepare a fresh workflow intent`));
}

/** Reject accessors, inherited fields, symbols, arrays, and non-data objects at the boundary. */
function dataRecord(input: unknown): Record<string, unknown> | undefined {
  try {
    if (input === null || typeof input !== "object") return undefined;
    const prototype: unknown = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return undefined;
    const record: Record<string, unknown> = Object.create(null);
    for (const key of Reflect.ownKeys(input)) {
      if (typeof key !== "string") return undefined;
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || !("value" in descriptor)) return undefined;
      record[key] = descriptor.value;
    }
    return record;
  } catch {
    return undefined;
  }
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Consume identifiable tokens even when another field makes confirmation invalid. */
function confirmationToken(input: unknown): string | undefined {
  try {
    if (input === null || typeof input !== "object") return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(input, "token");
    return descriptor && "value" in descriptor && nonempty(descriptor.value)
      ? descriptor.value
      : undefined;
  } catch {
    return undefined;
  }
}

function parsePrepare(input: unknown): PrepareSyncWorkflowIntentInput | undefined {
  const record = dataRecord(input);
  const keys = ["bindingId", "localTaskId", "externalId", "sourceUrl", "intent", "reason"];
  if (
    !record ||
    Object.keys(record).some((key) => !keys.includes(key)) ||
    !nonempty(record.bindingId) ||
    !nonempty(record.localTaskId) ||
    !nonempty(record.externalId) ||
    (record.sourceUrl !== undefined && !nonempty(record.sourceUrl)) ||
    record.intent !== "cancel" ||
    record.reason !== "confirmed-remote-deletion"
  )
    return undefined;
  // Copy only validated primitives; caller mutation cannot change stored authorization.
  return Object.freeze({
    bindingId: record.bindingId as PrepareSyncWorkflowIntentInput["bindingId"],
    localTaskId: record.localTaskId as PrepareSyncWorkflowIntentInput["localTaskId"],
    externalId: record.externalId,
    ...(record.sourceUrl !== undefined ? { sourceUrl: record.sourceUrl as string } : {}),
    intent: "cancel",
    reason: "confirmed-remote-deletion",
  });
}

function nativeHeads<T>(handle: DocHandle<T>): string {
  return [...handle.heads()].sort().join(",");
}

/**
 * Private local-operator boundary. Never expose these tools to provider pull contexts.
 *
 * Native heads deliberately reject even unrelated changes in the catalog, binding registry,
 * scoped task list, or task detail. This is conservative freshness, not a distributed lock,
 * deletion detection, remote baseline initialization, or proof of remote persistence/deletion.
 */
export function createSyncWorkflowIntentTools(params: {
  catalog: DocHandle<CatalogDocument>;
  repo: Repo;
  isClosed: () => boolean;
  flush: () => Promise<void>;
  now?: () => number;
}): SyncWorkflowIntentTools {
  const { catalog, repo, isClosed, flush } = params;
  const now = params.now ?? Date.now;
  // Factory-local memory intentionally makes tokens unusable after restart or in another host.
  const pending = new Map<string, PendingIntent>();

  function heads(scope: LoadedScope): Heads {
    return {
      catalog: nativeHeads(catalog),
      registry: nativeHeads(scope.registry),
      list: nativeHeads(scope.list),
      detail: scope.detail ? nativeHeads(scope.detail) : undefined,
    };
  }

  function sameHeads(scope: LoadedScope, expected: Heads): boolean {
    const actual = heads(scope);
    return (Object.keys(expected) as (keyof Heads)[]).every((key) => actual[key] === expected[key]);
  }

  /** All loads precede this synchronous authoritative scope/identity check. */
  function current(
    scope: LoadedScope,
    input: PrepareSyncWorkflowIntentInput,
  ): Result<{ task: Task; binding: IntegrationBinding }> {
    if (
      isClosed() ||
      !catalog.isReady() ||
      !scope.registry.isReady() ||
      !scope.list.isReady() ||
      (scope.detail && !scope.detail.isReady())
    )
      return invalid("Workflow intent data host is unavailable");
    const catalogDoc = catalog.doc();
    const bindings = scope.registry.doc().bindings.filter((item) => item.id === input.bindingId);
    const binding = bindings[0];
    const list = scope.list.doc();
    const candidates = list.tasks.filter((item) => item.id === input.localTaskId);
    const task = candidates[0];
    if (
      catalogDoc.integrationRegistryDocId !== scope.registryId ||
      catalogDoc.taskListDocIds[scope.projectId] !== scope.listId ||
      catalogDoc.projects.filter((item) => item.id === scope.projectId).length !== 1 ||
      bindings.length !== 1 ||
      !binding ||
      binding.projectId !== scope.projectId ||
      list.projectId !== scope.projectId ||
      candidates.length !== 1 ||
      !task ||
      task.projectId !== scope.projectId ||
      task.externalId !== input.externalId ||
      task.sourceUrl !== input.sourceUrl ||
      list.tasks.filter((item) => item.externalId === input.externalId).length !== 1 ||
      (input.sourceUrl !== undefined &&
        list.tasks.filter((item) => item.sourceUrl === input.sourceUrl).length !== 1) ||
      list.detailDocIds[input.localTaskId] !== scope.detailId ||
      (scope.detail && scope.detail.doc().taskId !== input.localTaskId) ||
      !isTaskStatus(task.status) ||
      !Number.isFinite(Date.parse(task.updatedAt))
    )
      return invalid(`Workflow intent scope or identity changed for task ${input.localTaskId}`);
    return ok({ task, binding });
  }

  return {
    async prepare(rawInput) {
      const input = parsePrepare(rawInput);
      if (!input) return invalid("Invalid cancellation workflow intent input");
      try {
        if (isClosed() || !catalog.isReady()) return invalid("Workflow intent data host is closed");
        const registryId = catalog.doc().integrationRegistryDocId;
        if (!registryId) return invalid(`Binding registry unavailable for ${input.bindingId}`);
        const registry = await repo.find<IntegrationRegistryDocument>(registryId as DocumentId);
        const bindings = registry.doc().bindings.filter((item) => item.id === input.bindingId);
        const projectId = bindings[0]?.projectId;
        if (bindings.length !== 1 || !projectId)
          return invalid(`Binding is missing or ambiguous: ${input.bindingId}`);
        const listId = catalog.doc().taskListDocIds[projectId];
        if (!listId) return invalid(`Task list unavailable for project ${projectId}`);
        const list = await repo.find<TaskListDocument>(listId as DocumentId);
        const detailId = list.doc().detailDocIds[input.localTaskId];
        const detail = detailId
          ? await repo.find<TaskDetailDocument>(detailId as DocumentId)
          : undefined;
        const scope = { registryId, projectId, listId, detailId, registry, list, detail };
        const timestamp = now();
        const expiresAt = timestamp + TOKEN_LIFETIME_MS;
        const expiresAtISO = new Date(expiresAt).toISOString();
        const token = randomBytes(32).toString("hex");
        // No awaits between these live reads, freshness capture, and issuing the token.
        const live = current(scope, input);
        if (!live.ok) return live;
        const snapshot = heads(scope);
        for (const [key, intent] of pending) {
          if (intent.expiresAt <= timestamp) pending.delete(key);
        }
        pending.set(token, { input, scope, heads: snapshot, expiresAt });
        return ok({
          token,
          bindingId: live.value.binding.id,
          projectId: live.value.task.projectId,
          localTaskId: live.value.task.id,
          externalId: input.externalId,
          ...(input.sourceUrl !== undefined ? { sourceUrl: input.sourceUrl } : {}),
          currentStatus: live.value.task.status,
          targetStatus: "canceled",
          expiresAt: expiresAtISO,
        });
      } catch (error) {
        return err(storageError(`Cannot prepare workflow intent: ${String(error)}`));
      }
    },

    async confirm(rawInput) {
      const token = confirmationToken(rawInput);
      const record = dataRecord(rawInput);
      const intent = typeof token === "string" ? pending.get(token) : undefined;
      // Consume before validation, mutation, or persistence. Every failure requires a fresh preview.
      if (typeof token === "string") pending.delete(token);
      if (
        !record ||
        !nonempty(token) ||
        record.token !== token ||
        record.confirmed !== true ||
        Object.keys(record).some((key) => key !== "token" && key !== "confirmed")
      )
        return invalid("Workflow intent requires only a token and explicit confirmed: true");
      if (!intent) return invalid("Workflow intent token is unknown or already consumed");
      try {
        const timestamp = now();
        if (!Number.isFinite(timestamp) || timestamp >= intent.expiresAt)
          return invalid("Workflow intent token expired");
        const updatedAt = new Date(timestamp).toISOString();
        const { scope, input } = intent;
        const live = current(scope, input);
        if (!live.ok) return live;
        if (!sameHeads(scope, intent.heads))
          return invalid(`Stale workflow intent for task ${input.localTaskId}`);

        // Explicit operator cancellation is separate from normal workflow transition validation.
        // It writes only status and the ordinary local edit clock, never a remote timestamp/base.
        const expectedList = JSON.parse(JSON.stringify(scope.list.doc())) as TaskListDocument;
        const index = expectedList.tasks.findIndex((task) => task.id === input.localTaskId);
        if (live.value.task.status !== "canceled") {
          expectedList.tasks[index].status = "canceled";
          expectedList.tasks[index].updatedAt = updatedAt;
          // No awaits between the authoritative native checks and this single native mutation.
          scope.list.change((doc) => {
            doc.tasks[index].status = "canceled";
            doc.tasks[index].updatedAt = updatedAt;
          });
        }
        if (
          JSON.stringify(scope.list.doc()) !== JSON.stringify(expectedList) ||
          nativeHeads(catalog) !== intent.heads.catalog ||
          nativeHeads(scope.registry) !== intent.heads.registry ||
          (scope.detail ? nativeHeads(scope.detail) : undefined) !== intent.heads.detail
        )
          return invalid(`Workflow intent was superseded for task ${input.localTaskId}`);
        const writtenHeads = heads(scope);
        await flush();
        // A successful flush alone cannot certify a write superseded while it was pending.
        const persisted = current(scope, input);
        if (!persisted.ok) return persisted;
        if (!sameHeads(scope, writtenHeads) || persisted.value.task.status !== "canceled") {
          return invalid(`Persisted workflow intent was superseded for task ${input.localTaskId}`);
        }
        const { task, binding } = persisted.value;
        return ok({
          bindingId: binding.id,
          projectId: task.projectId,
          localTaskId: task.id,
          externalId: task.externalId as string,
          ...(task.sourceUrl !== undefined ? { sourceUrl: task.sourceUrl } : {}),
          status: "canceled",
          updatedAt: task.updatedAt,
        });
      } catch (error) {
        return err(
          storageError(`Cannot persist workflow intent; prepare a fresh preview: ${String(error)}`),
        );
      }
    },
  };
}
