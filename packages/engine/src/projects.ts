import crypto from "node:crypto";
import type { DocHandle } from "@automerge/automerge-repo";
import {
  type ActorId,
  type CatalogDocument,
  type CreateProjectInput,
  createActorId,
  createProjectId,
  err,
  notFound,
  ok,
  type Project,
  type ProjectFilter,
  type ProjectId,
  type Result,
  type UpdateProjectInput,
  validateActorIds,
  validateCreateProjectInput,
  validateUpdateProjectInput,
} from "@todu/core";
import type { ProjectNamespace } from "./todu.js";

// ============================================================================
// Project namespace — CRUD operations on catalog document
// ============================================================================

export function createProjectNamespace(catalog: DocHandle<CatalogDocument>): ProjectNamespace {
  function normalizeActorIds(actorIds: readonly ActorId[]): ActorId[] {
    return actorIds.map((actorId) => createActorId(actorId.trim()));
  }

  function findMissingAuthorizedActorId(
    actorIds: readonly ActorId[],
  ): Project["authorizedAssigneeActorIds"][number] | null {
    const catalogDoc = catalog.doc();
    if (!catalogDoc) return actorIds[0] ?? null;

    const catalogActorIds = new Set<string>(catalogDoc.actors.map((actor) => actor.id));
    return actorIds.find((actorId) => !catalogActorIds.has(actorId)) ?? null;
  }

  function getProjectIndex(id: ProjectId): Result<number> {
    const doc = catalog.doc();
    if (!doc) return err(notFound("project", id));

    const index = doc.projects.findIndex((project) => project.id === id);
    if (index === -1) {
      return err(notFound("project", id));
    }

    return ok(index);
  }

  function validateAuthorizedActorIds(actorIds: readonly ActorId[]): Result<ActorId[]> {
    const normalizedActorIds = normalizeActorIds(actorIds);
    const actorIdsError = validateActorIds("actorIds", normalizedActorIds);
    if (actorIdsError) {
      return err(actorIdsError);
    }

    const missingActorId = findMissingAuthorizedActorId(normalizedActorIds);
    if (missingActorId) {
      return err(notFound("actor", missingActorId));
    }

    return ok(normalizedActorIds);
  }

  async function update(id: ProjectId, input: UpdateProjectInput): Promise<Result<Project>> {
    const validationErr = validateUpdateProjectInput(input);
    if (validationErr) return err(validationErr);

    const projectIndex = getProjectIndex(id);
    if (!projectIndex.ok) return projectIndex;

    const doc = catalog.doc();
    if (!doc) return err(notFound("project", id));

    const nextAuthorizedAssigneeActorIds = normalizeActorIds(
      input.authorizedAssigneeActorIds ??
        doc.projects[projectIndex.value].authorizedAssigneeActorIds,
    );
    const missingActorId = findMissingAuthorizedActorId(nextAuthorizedAssigneeActorIds);
    if (missingActorId) {
      return err(notFound("actor", missingActorId));
    }

    const now = new Date().toISOString();

    catalog.change((nextDoc) => {
      const project = nextDoc.projects[projectIndex.value];
      if (input.name !== undefined) project.name = input.name.trim();
      if (input.description !== undefined) project.description = input.description.trim();
      if (input.status !== undefined) project.status = input.status;
      if (input.priority !== undefined) project.priority = input.priority;
      if (input.authorizedAssigneeActorIds !== undefined) {
        project.authorizedAssigneeActorIds.splice(
          0,
          project.authorizedAssigneeActorIds.length,
          ...nextAuthorizedAssigneeActorIds,
        );
      }
      project.updatedAt = now;
    });

    return ok(cloneProject(catalog.doc()!.projects[projectIndex.value]));
  }

  async function updateAuthorizedActors(
    id: ProjectId,
    actorIds: readonly ActorId[],
  ): Promise<Result<Project>> {
    const validatedActorIds = validateAuthorizedActorIds(actorIds);
    if (!validatedActorIds.ok) return validatedActorIds;

    return update(id, {
      authorizedAssigneeActorIds: validatedActorIds.value,
    });
  }

  return {
    async create(input: CreateProjectInput): Promise<Result<Project>> {
      const validationErr = validateCreateProjectInput(input);
      if (validationErr) return err(validationErr);

      const catalogDoc = catalog.doc();
      const authorizedAssigneeActorIds = normalizeActorIds(
        input.authorizedAssigneeActorIds ??
          (catalogDoc?.ownerActorId ? [catalogDoc.ownerActorId] : []),
      );
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
      if (input.description !== undefined) {
        project.description = input.description.trim();
      }

      catalog.change((nextDoc) => {
        nextDoc.projects.push(project);
      });

      return ok(project);
    },

    async list(filter?: ProjectFilter): Promise<Result<Project[]>> {
      const doc = catalog.doc();
      if (!doc) return ok([]);

      let filtered = doc.projects.map(cloneProject);

      if (filter?.status) {
        const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
        filtered = filtered.filter((project) => statuses.includes(project.status));
      }
      if (filter?.priority) {
        filtered = filtered.filter((project) => project.priority === filter.priority);
      }
      if (filter?.search) {
        const lowerQuery = filter.search.toLowerCase();
        filtered = filtered.filter((project) => project.name.toLowerCase().includes(lowerQuery));
      }

      return ok(filtered);
    },

    async get(id: ProjectId): Promise<Result<Project>> {
      const doc = catalog.doc();
      if (!doc) return err(notFound("project", id));

      const project = doc.projects.find((candidate) => candidate.id === id);
      if (!project) return err(notFound("project", id));

      return ok(cloneProject(project));
    },

    update,

    async addAuthorizedActors(id: ProjectId, actorIds: ActorId[]): Promise<Result<Project>> {
      const project = await this.get(id);
      if (!project.ok) return project;

      const validatedActorIds = validateAuthorizedActorIds(actorIds);
      if (!validatedActorIds.ok) return validatedActorIds;

      const nextAuthorizedActorIds = [
        ...project.value.authorizedAssigneeActorIds,
        ...validatedActorIds.value.filter(
          (actorId) => !project.value.authorizedAssigneeActorIds.includes(actorId),
        ),
      ];

      return updateAuthorizedActors(id, nextAuthorizedActorIds);
    },

    async removeAuthorizedActors(id: ProjectId, actorIds: ActorId[]): Promise<Result<Project>> {
      const project = await this.get(id);
      if (!project.ok) return project;

      const validatedActorIds = validateAuthorizedActorIds(actorIds);
      if (!validatedActorIds.ok) return validatedActorIds;

      const actorIdsToRemove = new Set(validatedActorIds.value);
      return updateAuthorizedActors(
        id,
        project.value.authorizedAssigneeActorIds.filter(
          (actorId) => !actorIdsToRemove.has(actorId),
        ),
      );
    },

    async setAuthorizedActors(id: ProjectId, actorIds: ActorId[]): Promise<Result<Project>> {
      return updateAuthorizedActors(id, actorIds);
    },

    async delete(id: ProjectId): Promise<Result<void>> {
      const doc = catalog.doc();
      if (!doc) return err(notFound("project", id));

      const index = doc.projects.findIndex((project) => project.id === id);
      if (index === -1) return err(notFound("project", id));

      // TODO: When tasks slice lands, check for non-empty TaskListDocument
      // For now, allow deletion unconditionally.
      catalog.change((nextDoc) => {
        nextDoc.projects.splice(index, 1);
      });

      return ok(undefined);
    },
  };
}

/** Clone a project out of the Automerge proxy */
function cloneProject(project: Project): Project {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    status: project.status,
    priority: project.priority,
    authorizedAssigneeActorIds: [...(project.authorizedAssigneeActorIds ?? [])],
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}
