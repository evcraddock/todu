import type { DocHandle, DocumentId, Repo } from "@automerge/automerge-repo";
import {
  type CatalogDocument,
  err,
  type IntegrationRegistryDocument,
  ok,
  storageError,
  type TaskListDocument,
  validationError,
} from "@todu/core";
import type { ToduInternalTools } from "./todu.js";

/** Private host boundary: live metadata checks and callback invocation share one synchronous turn. */
export function createSyncLifecycleGuard(params: {
  catalog: DocHandle<CatalogDocument>;
  repo: Repo;
  isClosed: () => boolean;
}): ToduInternalTools["syncRuntime"]["withCurrentTaskLifecycle"] {
  const { catalog, repo, isClosed } = params;
  return async ({ binding, observations, isCurrentHost, run }) => {
    const registryId = catalog.doc()?.integrationRegistryDocId;
    const listId = catalog.doc()?.taskListDocIds[binding.projectId];
    if (!registryId)
      return err(validationError("syncPrecondition", "Sync binding registry unavailable"));
    let registry: DocHandle<IntegrationRegistryDocument>;
    let list: DocHandle<TaskListDocument> | undefined;
    try {
      registry = await repo.find<IntegrationRegistryDocument>(registryId as DocumentId);
      if (listId) list = await repo.find<TaskListDocument>(listId as DocumentId);
    } catch (error) {
      return err(storageError(`Cannot verify current sync lifecycle: ${String(error)}`));
    }

    if (isClosed() || !isCurrentHost())
      return err(validationError("syncPrecondition", "Local task context data host changed"));
    const currentCatalog = catalog.doc();
    const liveBindings = registry.doc()?.bindings.filter((item) => item.id === binding.id) ?? [];
    const currentBinding = liveBindings[0];
    const scopeFields = [
      "provider",
      "projectId",
      "targetKind",
      "targetRef",
      "enabled",
      "strategy",
    ] as const;
    if (
      currentCatalog?.integrationRegistryDocId !== registryId ||
      currentCatalog?.taskListDocIds[binding.projectId] !== listId ||
      !currentCatalog?.projects.some((project) => project.id === binding.projectId) ||
      liveBindings.length !== 1 ||
      !currentBinding ||
      scopeFields.some((field) => currentBinding[field] !== binding[field])
    )
      return err(
        validationError(
          "syncPrecondition",
          `Local task context binding/scope changed: ${binding.id}`,
        ),
      );

    const tasks = list?.doc()?.tasks ?? [];
    for (const expected of observations) {
      const candidates = tasks.filter((task) => task.id === expected.localTaskId);
      const task = candidates[0];
      if (
        expected.projectId !== binding.projectId ||
        expected.status !== "canceled" ||
        !expected.externalId ||
        candidates.length !== 1 ||
        !task ||
        task.projectId !== expected.projectId ||
        task.externalId !== expected.externalId ||
        task.sourceUrl !== expected.sourceUrl ||
        task.status !== expected.status ||
        task.updatedAt !== expected.updatedAt ||
        tasks.filter((item) => item.externalId === expected.externalId).length !== 1 ||
        (expected.sourceUrl !== undefined &&
          tasks.filter((item) => item.sourceUrl === expected.sourceUrl).length !== 1)
      )
        return err(
          validationError(
            "syncPrecondition",
            `stale cancellation exclusion for task ${expected.localTaskId}; pull must reevaluate current local state`,
          ),
        );
    }
    // No awaits occur between the authoritative document reads/checks and this invocation.
    await run();
    return ok(undefined);
  };
}
