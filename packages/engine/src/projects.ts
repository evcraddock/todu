import crypto from "node:crypto";
import type { DocHandle } from "@automerge/automerge-repo";
import {
  type CatalogDocument,
  type CreateProjectInput,
  createProjectId,
  err,
  notFound,
  ok,
  type Project,
  type ProjectFilter,
  type ProjectId,
  type Result,
  type UpdateProjectInput,
  validateCreateProjectInput,
  validateUpdateProjectInput,
} from "@todu/core";
import type { ProjectNamespace } from "./todu.js";

// ============================================================================
// Project namespace — CRUD operations on catalog document
// ============================================================================

export function createProjectNamespace(catalog: DocHandle<CatalogDocument>): ProjectNamespace {
  function findMissingAuthorizedActorId(
    actorIds: Project["authorizedAssigneeActorIds"],
  ): Project["authorizedAssigneeActorIds"][number] | null {
    const catalogDoc = catalog.doc();
    if (!catalogDoc) return actorIds[0] ?? null;

    const catalogActorIds = new Set<string>(catalogDoc.actors.map((actor) => actor.id));
    return actorIds.find((actorId) => !catalogActorIds.has(actorId)) ?? null;
  }

  return {
    async create(input: CreateProjectInput): Promise<Result<Project>> {
      const validationErr = validateCreateProjectInput(input);
      if (validationErr) return err(validationErr);

      const catalogDoc = catalog.doc();
      const authorizedAssigneeActorIds =
        input.authorizedAssigneeActorIds ??
        (catalogDoc?.ownerActorId ? [catalogDoc.ownerActorId] : []);
      const missingActorId = findMissingAuthorizedActorId(authorizedAssigneeActorIds);
      if (missingActorId) {
        return err(notFound("actor", missingActorId));
      }

      const now = new Date().toISOString();
      const id = createProjectId(`proj-${crypto.randomUUID().slice(0, 8)}`);

      const project: Project = {
        id,
        name: input.name.trim(),
        status: "active",
        priority: input.priority ?? "medium",
        authorizedAssigneeActorIds,
        createdAt: now,
        updatedAt: now,
      };
      // Automerge doesn't allow undefined — only set optional fields if present
      if (input.description !== undefined) {
        project.description = input.description.trim();
      }

      catalog.change((doc) => {
        doc.projects.push(project);
      });

      return ok(project);
    },

    async list(filter?: ProjectFilter): Promise<Result<Project[]>> {
      const doc = catalog.doc();
      if (!doc) return ok([]);

      let filtered = doc.projects.map(cloneProject);

      if (filter?.status) {
        const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
        filtered = filtered.filter((p) => statuses.includes(p.status));
      }
      if (filter?.priority) {
        filtered = filtered.filter((p) => p.priority === filter.priority);
      }
      if (filter?.search) {
        const lowerQuery = filter.search.toLowerCase();
        filtered = filtered.filter((p) => p.name.toLowerCase().includes(lowerQuery));
      }

      return ok(filtered);
    },

    async get(id: ProjectId): Promise<Result<Project>> {
      const doc = catalog.doc();
      if (!doc) return err(notFound("project", id));

      const project = doc.projects.find((p) => p.id === id);
      if (!project) return err(notFound("project", id));

      return ok(cloneProject(project));
    },

    async update(id: ProjectId, input: UpdateProjectInput): Promise<Result<Project>> {
      const validationErr = validateUpdateProjectInput(input);
      if (validationErr) return err(validationErr);

      const doc = catalog.doc();
      if (!doc) return err(notFound("project", id));

      const index = doc.projects.findIndex((p) => p.id === id);
      if (index === -1) return err(notFound("project", id));

      const nextAuthorizedAssigneeActorIds =
        input.authorizedAssigneeActorIds ?? doc.projects[index].authorizedAssigneeActorIds;
      const missingActorId = findMissingAuthorizedActorId(nextAuthorizedAssigneeActorIds);
      if (missingActorId) {
        return err(notFound("actor", missingActorId));
      }

      const now = new Date().toISOString();

      catalog.change((doc) => {
        const project = doc.projects[index];
        if (input.name !== undefined) project.name = input.name.trim();
        if (input.description !== undefined) project.description = input.description.trim();
        if (input.status !== undefined) project.status = input.status;
        if (input.priority !== undefined) project.priority = input.priority;
        if (input.authorizedAssigneeActorIds !== undefined) {
          project.authorizedAssigneeActorIds.splice(
            0,
            project.authorizedAssigneeActorIds.length,
            ...input.authorizedAssigneeActorIds,
          );
        }
        project.updatedAt = now;
      });

      // Read back the updated project
      const updated = catalog.doc()!.projects[index];
      return ok(cloneProject(updated));
    },

    async delete(id: ProjectId): Promise<Result<void>> {
      const doc = catalog.doc();
      if (!doc) return err(notFound("project", id));

      const index = doc.projects.findIndex((p) => p.id === id);
      if (index === -1) return err(notFound("project", id));

      // TODO: When tasks slice lands, check for non-empty TaskListDocument
      // For now, allow deletion unconditionally.

      catalog.change((doc) => {
        doc.projects.splice(index, 1);
      });

      return ok(undefined);
    },
  };
}

/** Clone a project out of the Automerge proxy */
function cloneProject(p: Project): Project {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    status: p.status,
    priority: p.priority,
    authorizedAssigneeActorIds: [...(p.authorizedAssigneeActorIds ?? [])],
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
