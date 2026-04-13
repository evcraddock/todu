import { describe, expect, it } from "vitest";
import {
  createEmptyCatalog,
  createIntegrationBindingStatusDocument,
  createIntegrationRegistryDocument,
  createNotesDocument,
  createTaskDetailDocument,
  createTaskListDocument,
  DEFAULT_OWNER_ACTOR_ID,
  SCHEMA_VERSION,
} from "./schema.js";
import { createActorId, createIntegrationBindingId, createProjectId } from "./types.js";

describe("schema", () => {
  it("exports schema version", () => {
    expect(SCHEMA_VERSION).toBe(2);
  });

  describe("createEmptyCatalog", () => {
    it("creates a catalog with correct version", () => {
      const catalog = createEmptyCatalog();
      expect(catalog.version).toBe(SCHEMA_VERSION);
    });

    it("creates a catalog with empty projects", () => {
      const catalog = createEmptyCatalog();
      expect(catalog.projects).toEqual([]);
    });

    it("creates a catalog with empty labels", () => {
      const catalog = createEmptyCatalog();
      expect(catalog.labels).toEqual([]);
    });

    it("creates a catalog with the default owner actor", () => {
      const catalog = createEmptyCatalog();
      expect(catalog.actors).toEqual([{ id: DEFAULT_OWNER_ACTOR_ID, displayName: "user" }]);
      expect(catalog.ownerActorId).toBe(DEFAULT_OWNER_ACTOR_ID);
    });

    it("creates a catalog with empty taskListDocIds", () => {
      const catalog = createEmptyCatalog();
      expect(catalog.taskListDocIds).toEqual({});
    });

    it("creates a catalog with empty notesBucketDocIds", () => {
      const catalog = createEmptyCatalog();
      expect(catalog.notesBucketDocIds).toEqual({});
    });

    it("creates a catalog with empty noteBucketByNoteId", () => {
      const catalog = createEmptyCatalog();
      expect(catalog.noteBucketByNoteId).toEqual({});
    });

    it("creates a catalog with empty integrationStatusDocIds", () => {
      const catalog = createEmptyCatalog();
      expect(catalog.integrationStatusDocIds).toEqual({});
    });

    it("creates a catalog with settings", () => {
      const catalog = createEmptyCatalog();
      expect(catalog.settings.schemaVersion).toBe(SCHEMA_VERSION);
    });
  });

  describe("createTaskListDocument", () => {
    it("creates a task list for a project", () => {
      const projectId = createProjectId("proj-abc");
      const doc = createTaskListDocument(projectId);
      expect(doc.projectId).toBe(projectId);
      expect(doc.tasks).toEqual([]);
      expect(doc.detailDocIds).toEqual({});
    });
  });

  describe("createTaskDetailDocument", () => {
    it("creates a detail document", () => {
      const doc = createTaskDetailDocument("task-123", "Some description", {
        state: "pendingApproval",
        sourceBindingId: createIntegrationBindingId("ibind-1"),
        sourceActorId: createActorId("actor-1"),
        sourceFingerprint: "sha1:abc",
      });
      expect(doc.taskId).toBe("task-123");
      expect(doc.description).toBe("Some description");
      expect(doc.descriptionApproval?.state).toBe("pendingApproval");
      expect(doc.descriptionApproval?.sourceBindingId).toBe("ibind-1");
    });
  });

  describe("createNotesDocument", () => {
    it("creates an empty notes document", () => {
      const doc = createNotesDocument();
      expect(doc.notes).toEqual([]);
    });
  });

  describe("createIntegrationRegistryDocument", () => {
    it("creates an empty integration registry document", () => {
      const doc = createIntegrationRegistryDocument();
      expect(doc.bindings).toEqual([]);
    });
  });

  describe("createIntegrationBindingStatusDocument", () => {
    it("creates a default idle status document", () => {
      const bindingId = createIntegrationBindingId("ibind-123");
      const doc = createIntegrationBindingStatusDocument(bindingId, "2026-03-08T00:00:00Z");
      expect(doc.bindingId).toBe(bindingId);
      expect(doc.state).toBe("idle");
      expect(doc.authorityId).toBeNull();
      expect(doc.lastSuccessfulSyncAt).toBeNull();
      expect(doc.lastAttemptedSyncAt).toBeNull();
      expect(doc.lastErrorSummary).toBeNull();
      expect(doc.updatedAt).toBe("2026-03-08T00:00:00Z");
    });
  });
});
