import crypto from "node:crypto";
import type { DocHandle } from "@automerge/automerge-repo";
import {
  type CatalogDocument,
  type CreateProjectInput,
  type Project,
  type ProjectId,
  type Result,
  type UpdateProjectInput,
  createProjectId,
  err,
  notFound,
  ok,
  validateCreateProjectInput,
  validateUpdateProjectInput,
} from "@todu/core";
import type { ProjectNamespace } from "./todu.js";

// ============================================================================
// Project namespace — CRUD operations on catalog document
// ============================================================================

export function createProjectNamespace(catalog: DocHandle<CatalogDocument>): ProjectNamespace {
  return {
    async create(input: CreateProjectInput): Promise<Result<Project>> {
      const validationErr = validateCreateProjectInput(input);
      if (validationErr) return err(validationErr);

      const now = new Date().toISOString();
      const id = createProjectId(`proj-${crypto.randomUUID().slice(0, 8)}`);

      const project: Project = {
        id,
        name: input.name.trim(),
        status: "active",
        priority: input.priority ?? "medium",
        syncStrategy: "none",
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

    async list(): Promise<Result<Project[]>> {
      const doc = catalog.doc();
      if (!doc) return ok([]);
      // Return a plain copy to avoid Automerge proxies leaking
      return ok(doc.projects.map(cloneProject));
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

      const now = new Date().toISOString();

      catalog.change((doc) => {
        const project = doc.projects[index];
        if (input.name !== undefined) project.name = input.name.trim();
        if (input.description !== undefined) project.description = input.description.trim();
        if (input.status !== undefined) project.status = input.status;
        if (input.priority !== undefined) project.priority = input.priority;
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
    externalId: p.externalId,
    systemId: p.systemId,
    syncStrategy: p.syncStrategy,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
