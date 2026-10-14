import crypto from "node:crypto";
import type { DocHandle, DocumentId, Repo } from "@automerge/automerge-repo";
import {
  type Actor,
  type CatalogDocument,
  err,
  type IntegrationBinding,
  type IntegrationBindingActorMapping,
  type IntegrationRegistryDocument,
  ok,
  type Project,
  type Result,
  storageError,
  type TaskDetailDocument,
  type TaskListDocument,
  type TaskWithDetail,
  validateUpdateIntegrationBindingInput,
  validationError,
} from "@todu/core";

export interface SyncTaskStateGuard {
  /** Synchronous live scope check, suitable for the engine mutation boundary. */
  verifyScope(): Result<void>;
  /** Complete values without rejecting this batch's already applied unrelated task writes. */
  verifyValues(): Result<void>;
  /** Synchronous scope, complete task-value, and native revision check. */
  verify(): Result<void>;
  verifyAndRun(run: () => Promise<void>): Promise<Result<void>>;
}

export interface CaptureSyncTaskStateInput {
  binding: IntegrationBinding;
  project: Project;
  actors: readonly Actor[];
  tasks: readonly TaskWithDetail[];
  isCurrentHost: () => boolean;
}

export function syncValuesEqual(left: unknown, right: unknown): boolean {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value)
          .filter(([, v]) => v !== undefined)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, canonical(v)]),
      );
    return value;
  };
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

/** Private host service; no handles, callbacks or mutable tools reach providers. */
export function createSyncTaskStateCapture(options: {
  catalog: DocHandle<CatalogDocument>;
  repo: Repo;
  isClosed: () => boolean;
}): (input: CaptureSyncTaskStateInput) => Promise<Result<SyncTaskStateGuard>> {
  const { catalog, repo, isClosed } = options;
  return async (input) => {
    const { binding, project, actors } = structuredClone({
      binding: input.binding,
      project: input.project,
      actors: input.actors,
    });
    const { isCurrentHost } = input;
    const tasks = structuredClone(input.tasks);
    const registryId = catalog.doc()?.integrationRegistryDocId;
    const listId = catalog.doc()?.taskListDocIds[binding.projectId];
    if (!registryId) return err(validationError("syncPrecondition", "Sync registry unavailable"));
    let registry: DocHandle<IntegrationRegistryDocument>;
    let list: DocHandle<TaskListDocument> | undefined;
    const details = new Map<string, DocHandle<TaskDetailDocument>>();
    try {
      registry = await repo.find<IntegrationRegistryDocument>(registryId as DocumentId);
      if (listId) list = await repo.find<TaskListDocument>(listId as DocumentId);
      for (const task of tasks) {
        const id = list?.doc()?.detailDocIds[task.id];
        if (id) details.set(task.id, await repo.find<TaskDetailDocument>(id as DocumentId));
      }
    } catch (error) {
      return err(storageError(`Cannot capture sync task state: ${String(error)}`));
    }
    const fail = (message: string) => err(validationError("syncPrecondition", message));
    function verifyScope(): Result<void> {
      if (isClosed() || !isCurrentHost()) return fail("Sync data host changed");
      const doc = catalog.doc();
      const currentBinding = registry.doc()?.bindings.filter((row) => row.id === binding.id) ?? [];
      const currentProject = doc?.projects.filter((row) => row.id === binding.projectId) ?? [];
      if (
        doc?.integrationRegistryDocId !== registryId ||
        currentBinding.length !== 1 ||
        currentProject.length !== 1 ||
        !syncValuesEqual(currentBinding[0], binding) ||
        !syncValuesEqual(currentProject[0], project) ||
        !syncValuesEqual(doc?.actors, actors)
      )
        return fail("Sync binding, project authorization or actor mapping changed");
      return ok(undefined);
    }
    function verifyValues(): Result<void> {
      const scope = verifyScope();
      if (!scope.ok) return scope;
      if (catalog.doc()?.taskListDocIds[binding.projectId] !== listId)
        return fail("Sync task-list reference changed");
      const doc = list?.doc();
      for (const expected of tasks) {
        const matches = doc?.tasks.filter((row) => row.id === expected.id) ?? [];
        const task = matches[0];
        const detail = details.get(expected.id)?.doc();
        const approval = detail
          ? {
              ...(detail.descriptionApproval ?? { state: "notRequired" }),
              sourceFingerprint: `sha1:${crypto.createHash("sha1").update(detail.description).digest("hex")}`,
            }
          : undefined;
        if (
          matches.length !== 1 ||
          !task ||
          task.projectId !== binding.projectId ||
          !expected.externalId ||
          doc?.tasks.filter((row) => row.externalId === expected.externalId).length !== 1 ||
          (expected.sourceUrl !== undefined &&
            doc?.tasks.filter((row) => row.sourceUrl === expected.sourceUrl).length !== 1) ||
          doc?.detailDocIds[expected.id] !== details.get(expected.id)?.documentId ||
          !syncValuesEqual(
            { ...task, description: detail?.description ?? "", descriptionApproval: approval },
            { ...expected, description: expected.description ?? "" },
          )
        )
          return fail(`Stale or ambiguous sync task observation: ${expected.id}`);
      }
      return ok(undefined);
    }
    const checked = verifyValues();
    if (!checked.ok) return checked;
    const heads = [catalog, registry, ...(list ? [list] : []), ...details.values()].map(
      (handle) => ({
        handle,
        heads: [...handle.heads()].sort().join(","),
      }),
    );
    function verify(): Result<void> {
      const checked = verifyValues();
      if (!checked.ok) return checked;
      if (heads.some((row) => [...row.handle.heads()].sort().join(",") !== row.heads))
        return fail("Sync observation revision changed; observe again");
      return ok(undefined);
    }
    return ok({
      verifyScope,
      verifyValues,
      verify,
      async verifyAndRun(run) {
        const checked = verify();
        if (!checked.ok) return checked;
        // No await occurs between authoritative verification and callback invocation.
        await run();
        return ok(undefined);
      },
    });
  };
}

/** Preserve concurrent binding edits when host-owned imported actor mappings are saved. */
export function createSyncActorMappingWriter(options: {
  catalog: DocHandle<CatalogDocument>;
  repo: Repo;
  isClosed: () => boolean;
}): (input: {
  binding: IntegrationBinding;
  mappings: IntegrationBindingActorMapping[];
  isCurrentHost: () => boolean;
}) => Promise<Result<IntegrationBinding>> {
  return async ({ binding, mappings, isCurrentHost }) => {
    const registryId = options.catalog.doc()?.integrationRegistryDocId;
    if (!registryId) return err(validationError("syncPrecondition", "Sync registry unavailable"));
    let registry: DocHandle<IntegrationRegistryDocument>;
    try {
      registry = await options.repo.find<IntegrationRegistryDocument>(registryId as DocumentId);
    } catch (error) {
      return err(storageError(`Cannot load sync mapping registry: ${String(error)}`));
    }
    const rows = registry.doc()?.bindings ?? [];
    const matches = rows.filter((row) => row.id === binding.id);
    if (
      options.isClosed() ||
      !isCurrentHost() ||
      options.catalog.doc()?.integrationRegistryDocId !== registryId ||
      matches.length !== 1 ||
      !syncValuesEqual(matches[0], binding)
    )
      return err(
        validationError(
          "syncPrecondition",
          "Sync binding changed before actor mapping persistence",
        ),
      );
    const nextOptions = { ...(binding.options ?? {}), actorMappings: structuredClone(mappings) };
    const invalid = validateUpdateIntegrationBindingInput(
      { options: nextOptions },
      { bindings: rows, currentBindingId: binding.id },
    );
    if (invalid) return err(invalid);
    const index = rows.findIndex((row) => row.id === binding.id);
    registry.change((doc) => {
      doc.bindings[index].options = nextOptions;
      doc.bindings[index].updatedAt = new Date().toISOString();
    });
    return ok(structuredClone(registry.doc()!.bindings[index]));
  };
}
