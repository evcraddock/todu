import crypto from "node:crypto";
import type { DocHandle, DocumentId, Repo } from "@automerge/automerge-repo";
import {
  type CatalogDocument,
  type CreateIntegrationBindingInput,
  createIntegrationBindingId,
  createIntegrationBindingStatusDocument,
  createIntegrationRegistryDocument,
  err,
  type IntegrationBinding,
  type IntegrationBindingFilter,
  type IntegrationBindingId,
  type IntegrationBindingStatus,
  type IntegrationBindingStatusDocument,
  type IntegrationRegistryDocument,
  notFound,
  ok,
  type Result,
  type UpdateIntegrationBindingInput,
  type UpdateIntegrationBindingStatusInput,
  validateCreateIntegrationBindingInput,
  validateUpdateIntegrationBindingInput,
  validateUpdateIntegrationBindingStatusInput,
} from "@todu/core";
import type { IntegrationNamespace } from "./todu.js";

function cloneIntegrationBinding(binding: IntegrationBinding): IntegrationBinding {
  return { ...binding };
}

function cloneIntegrationBindingStatus(
  status: IntegrationBindingStatusDocument,
): IntegrationBindingStatus {
  return {
    bindingId: status.bindingId,
    state: status.state,
    authorityId: status.authorityId,
    lastSuccessfulSyncAt: status.lastSuccessfulSyncAt,
    lastAttemptedSyncAt: status.lastAttemptedSyncAt,
    lastErrorSummary: status.lastErrorSummary,
    updatedAt: status.updatedAt,
  };
}

export function createIntegrationNamespace(
  catalog: DocHandle<CatalogDocument>,
  repo: Repo,
): IntegrationNamespace {
  function projectExists(projectId: string): boolean {
    const catalogDoc = catalog.doc();
    return catalogDoc?.projects.some((project) => project.id === projectId) ?? false;
  }

  async function getRegistryHandle(): Promise<DocHandle<IntegrationRegistryDocument> | null> {
    const docId = catalog.doc()?.integrationRegistryDocId;
    if (!docId) return null;
    return repo.find<IntegrationRegistryDocument>(docId as DocumentId);
  }

  async function getOrCreateRegistryHandle(): Promise<DocHandle<IntegrationRegistryDocument>> {
    const existing = await getRegistryHandle();
    if (existing) return existing;

    const handle = repo.create<IntegrationRegistryDocument>();
    const template = createIntegrationRegistryDocument();
    handle.change((doc) => {
      doc.bindings = template.bindings;
    });

    catalog.change((doc) => {
      doc.integrationRegistryDocId = handle.documentId;
      if (doc.integrationStatusDocIds === undefined || doc.integrationStatusDocIds === null) {
        doc.integrationStatusDocIds = {};
      }
    });

    return handle;
  }

  async function getStatusHandle(
    bindingId: IntegrationBindingId,
  ): Promise<DocHandle<IntegrationBindingStatusDocument> | null> {
    const docId = catalog.doc()?.integrationStatusDocIds?.[bindingId];
    if (!docId) return null;
    return repo.find<IntegrationBindingStatusDocument>(docId as DocumentId);
  }

  async function getOrCreateStatusHandle(
    bindingId: IntegrationBindingId,
    updatedAt: string,
  ): Promise<DocHandle<IntegrationBindingStatusDocument>> {
    const existing = await getStatusHandle(bindingId);
    if (existing) return existing;

    const handle = repo.create<IntegrationBindingStatusDocument>();
    const template = createIntegrationBindingStatusDocument(bindingId, updatedAt);
    handle.change((doc) => {
      doc.bindingId = template.bindingId;
      doc.state = template.state;
      doc.authorityId = template.authorityId;
      doc.lastSuccessfulSyncAt = template.lastSuccessfulSyncAt;
      doc.lastAttemptedSyncAt = template.lastAttemptedSyncAt;
      doc.lastErrorSummary = template.lastErrorSummary;
      doc.updatedAt = template.updatedAt;
    });

    catalog.change((doc) => {
      if (doc.integrationStatusDocIds === undefined || doc.integrationStatusDocIds === null) {
        doc.integrationStatusDocIds = {};
      }
      doc.integrationStatusDocIds[bindingId] = handle.documentId;
    });

    return handle;
  }

  async function listBindings(): Promise<IntegrationBinding[]> {
    const registryHandle = await getRegistryHandle();
    const registryDoc = registryHandle?.doc();
    return registryDoc?.bindings.map(cloneIntegrationBinding) ?? [];
  }

  async function findBinding(id: IntegrationBindingId): Promise<
    | {
        found: true;
        binding: IntegrationBinding;
        index: number;
        registryHandle: DocHandle<IntegrationRegistryDocument>;
      }
    | { found: false }
  > {
    const registryHandle = await getRegistryHandle();
    const registryDoc = registryHandle?.doc();
    if (!registryHandle || !registryDoc) return { found: false };

    const index = registryDoc.bindings.findIndex((binding) => binding.id === id);
    if (index === -1) return { found: false };

    return {
      found: true,
      binding: cloneIntegrationBinding(registryDoc.bindings[index]),
      index,
      registryHandle,
    };
  }

  return {
    async create(input: CreateIntegrationBindingInput): Promise<Result<IntegrationBinding>> {
      if (!projectExists(input.projectId)) {
        return err(notFound("project", input.projectId));
      }

      const registryHandle = await getOrCreateRegistryHandle();
      const existingBindings = registryHandle.doc()?.bindings.map(cloneIntegrationBinding) ?? [];
      const validationErr = validateCreateIntegrationBindingInput(input, existingBindings);
      if (validationErr) return err(validationErr);

      const now = new Date().toISOString();
      const bindingId = createIntegrationBindingId(`ibind-${crypto.randomUUID().slice(0, 8)}`);
      const binding: IntegrationBinding = {
        id: bindingId,
        provider: input.provider.trim(),
        projectId: input.projectId,
        targetKind: input.targetKind.trim(),
        targetRef: input.targetRef.trim(),
        strategy: input.strategy ?? "bidirectional",
        enabled: input.enabled ?? true,
        createdAt: now,
        updatedAt: now,
      };

      await getOrCreateStatusHandle(bindingId, now);
      registryHandle.change((doc) => {
        doc.bindings.push(binding);
      });

      return ok(cloneIntegrationBinding(binding));
    },

    async list(filter?: IntegrationBindingFilter): Promise<Result<IntegrationBinding[]>> {
      let bindings = await listBindings();

      if (filter?.provider !== undefined) {
        bindings = bindings.filter((binding) => binding.provider === filter.provider);
      }
      if (filter?.projectId !== undefined) {
        bindings = bindings.filter((binding) => binding.projectId === filter.projectId);
      }
      if (filter?.enabled !== undefined) {
        bindings = bindings.filter((binding) => binding.enabled === filter.enabled);
      }

      return ok(bindings);
    },

    async get(id: IntegrationBindingId): Promise<Result<IntegrationBinding>> {
      const result = await findBinding(id);
      if (!result.found) return err(notFound("integration binding", id));
      return ok(result.binding);
    },

    async update(
      id: IntegrationBindingId,
      input: UpdateIntegrationBindingInput,
    ): Promise<Result<IntegrationBinding>> {
      const result = await findBinding(id);
      if (!result.found) return err(notFound("integration binding", id));

      if (input.projectId !== undefined && !projectExists(input.projectId)) {
        return err(notFound("project", input.projectId));
      }

      const bindings = result.registryHandle.doc()?.bindings.map(cloneIntegrationBinding) ?? [];
      const validationErr = validateUpdateIntegrationBindingInput(input, {
        bindings,
        currentBindingId: id,
      });
      if (validationErr) return err(validationErr);

      const now = new Date().toISOString();
      result.registryHandle.change((doc) => {
        const binding = doc.bindings[result.index];
        if (input.provider !== undefined) binding.provider = input.provider.trim();
        if (input.projectId !== undefined) binding.projectId = input.projectId;
        if (input.targetKind !== undefined) binding.targetKind = input.targetKind.trim();
        if (input.targetRef !== undefined) binding.targetRef = input.targetRef.trim();
        if (input.strategy !== undefined) binding.strategy = input.strategy;
        if (input.enabled !== undefined) binding.enabled = input.enabled;
        binding.updatedAt = now;
      });

      return ok(cloneIntegrationBinding(result.registryHandle.doc()!.bindings[result.index]));
    },

    async delete(id: IntegrationBindingId): Promise<Result<void>> {
      const result = await findBinding(id);
      if (!result.found) return err(notFound("integration binding", id));

      result.registryHandle.change((doc) => {
        doc.bindings.splice(result.index, 1);
      });

      catalog.change((doc) => {
        if (!doc.integrationStatusDocIds) return;
        delete doc.integrationStatusDocIds[id];
      });

      return ok(undefined);
    },

    async getStatus(id: IntegrationBindingId): Promise<Result<IntegrationBindingStatus>> {
      const bindingResult = await findBinding(id);
      if (!bindingResult.found) return err(notFound("integration binding", id));

      const statusHandle = await getStatusHandle(id);
      const statusDoc = statusHandle?.doc();
      if (!statusHandle || !statusDoc) {
        return err(notFound("integration binding status", id));
      }

      return ok(cloneIntegrationBindingStatus(statusDoc));
    },

    async updateStatus(
      id: IntegrationBindingId,
      input: UpdateIntegrationBindingStatusInput,
    ): Promise<Result<IntegrationBindingStatus>> {
      const bindingResult = await findBinding(id);
      if (!bindingResult.found) return err(notFound("integration binding", id));

      const validationErr = validateUpdateIntegrationBindingStatusInput(input);
      if (validationErr) return err(validationErr);

      const now = new Date().toISOString();
      const statusHandle = await getOrCreateStatusHandle(id, now);
      statusHandle.change((doc) => {
        if (input.state !== undefined) doc.state = input.state;
        if (input.authorityId !== undefined) {
          doc.authorityId = input.authorityId === null ? null : input.authorityId.trim();
        }
        if (input.lastSuccessfulSyncAt !== undefined) {
          doc.lastSuccessfulSyncAt = input.lastSuccessfulSyncAt;
        }
        if (input.lastAttemptedSyncAt !== undefined) {
          doc.lastAttemptedSyncAt = input.lastAttemptedSyncAt;
        }
        if (input.lastErrorSummary !== undefined) {
          doc.lastErrorSummary =
            input.lastErrorSummary === null ? null : input.lastErrorSummary.trim();
        }
        doc.updatedAt = now;
      });

      return ok(cloneIntegrationBindingStatus(statusHandle.doc()!));
    },
  };
}
