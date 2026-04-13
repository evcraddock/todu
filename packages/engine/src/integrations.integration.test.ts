import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { IntegrationBindingId, ProjectId } from "@todu/core";
import { createActorId, createIntegrationBindingId } from "@todu/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTodu } from "./index.js";
import type { Todu } from "./todu.js";

describe("integration namespace", () => {
  let tmpDir: string;
  let todu: Todu;
  let projectId: ProjectId;
  let otherProjectId: ProjectId;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-integrations-"));
    todu = await createTodu({ storagePath: tmpDir });

    const project = await todu.project.create({ name: "Synced Project" });
    if (!project.ok) throw new Error("Failed to create project");
    projectId = project.value.id;

    const otherProject = await todu.project.create({ name: "Other Project" });
    if (!otherProject.ok) throw new Error("Failed to create second project");
    otherProjectId = otherProject.value.id;
  });

  afterEach(async () => {
    await todu.close();
    await new Promise((r) => setTimeout(r, 50));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function createBinding() {
    return todu.integration.create({
      provider: "github",
      projectId,
      targetKind: "repository",
      targetRef: "owner/repo",
    });
  }

  describe("CRUD", () => {
    it("creates a binding with defaults and an initial status document", async () => {
      const result = await createBinding();
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.id).toMatch(/^ibind-/);
      expect(result.value.provider).toBe("github");
      expect(result.value.projectId).toBe(projectId);
      expect(result.value.targetKind).toBe("repository");
      expect(result.value.targetRef).toBe("owner/repo");
      expect(result.value.strategy).toBe("bidirectional");
      expect(result.value.enabled).toBe(true);

      const status = await todu.integration.getStatus(result.value.id);
      expect(status.ok).toBe(true);
      if (!status.ok) return;

      expect(status.value.bindingId).toBe(result.value.id);
      expect(status.value.state).toBe("idle");
      expect(status.value.authorityId).toBeNull();
      expect(status.value.lastAttemptedSyncAt).toBeNull();
      expect(status.value.lastSuccessfulSyncAt).toBeNull();
      expect(status.value.lastErrorSummary).toBeNull();
    });

    it("lists bindings and supports provider, project, and enabled filters", async () => {
      const bindingA = await createBinding();
      const bindingB = await todu.integration.create({
        provider: "forgejo",
        projectId: otherProjectId,
        targetKind: "repository",
        targetRef: "owner/other",
        enabled: false,
      });
      if (!bindingA.ok || !bindingB.ok) throw new Error("Failed to create bindings");

      const all = await todu.integration.list();
      expect(all.ok).toBe(true);
      if (!all.ok) return;
      expect(all.value).toHaveLength(2);

      const byProvider = await todu.integration.list({ provider: "github" });
      expect(byProvider.ok).toBe(true);
      if (!byProvider.ok) return;
      expect(byProvider.value).toHaveLength(1);
      expect(byProvider.value[0].id).toBe(bindingA.value.id);

      const byProject = await todu.integration.list({ projectId: otherProjectId });
      expect(byProject.ok).toBe(true);
      if (!byProject.ok) return;
      expect(byProject.value).toHaveLength(1);
      expect(byProject.value[0].id).toBe(bindingB.value.id);

      const disabled = await todu.integration.list({ enabled: false });
      expect(disabled.ok).toBe(true);
      if (!disabled.ok) return;
      expect(disabled.value).toHaveLength(1);
      expect(disabled.value[0].id).toBe(bindingB.value.id);
    });

    it("persists actor mappings with trust metadata in binding options", async () => {
      const created = await todu.integration.create({
        provider: "github",
        projectId,
        targetKind: "repository",
        targetRef: "owner/repo",
        options: {
          actorMappings: [
            {
              actorId: createActorId("actor-user"),
              externalAccountId: "12345",
              externalLogin: "evcraddock",
              displayName: "Erik",
              trusted: true,
            },
          ],
        },
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      expect(created.value.options?.actorMappings).toEqual([
        {
          actorId: "actor-user",
          externalAccountId: "12345",
          externalLogin: "evcraddock",
          displayName: "Erik",
          trusted: true,
        },
      ]);

      const fetched = await todu.integration.get(created.value.id);
      expect(fetched.ok).toBe(true);
      if (!fetched.ok) return;
      expect(fetched.value.options?.actorMappings).toEqual(created.value.options?.actorMappings);

      const returnedMappings = fetched.value.options?.actorMappings as Array<{ trusted?: boolean }>;
      returnedMappings[0].trusted = false;

      const fetchedAgain = await todu.integration.get(created.value.id);
      expect(fetchedAgain.ok).toBe(true);
      if (!fetchedAgain.ok) return;
      expect(fetchedAgain.value.options?.actorMappings).toEqual([
        {
          actorId: "actor-user",
          externalAccountId: "12345",
          externalLogin: "evcraddock",
          displayName: "Erik",
          trusted: true,
        },
      ]);
    });

    it("gets, updates, and deletes a binding", async () => {
      const created = await createBinding();
      if (!created.ok) throw new Error("Failed to create binding");

      const fetched = await todu.integration.get(created.value.id);
      expect(fetched.ok).toBe(true);
      if (!fetched.ok) return;
      expect(fetched.value.targetRef).toBe("owner/repo");

      const updated = await todu.integration.update(created.value.id, {
        provider: "forgejo",
        projectId: otherProjectId,
        targetKind: "project",
        targetRef: "team/repo",
        strategy: "pull",
        enabled: false,
      });
      expect(updated.ok).toBe(true);
      if (!updated.ok) return;

      expect(updated.value.provider).toBe("forgejo");
      expect(updated.value.projectId).toBe(otherProjectId);
      expect(updated.value.targetKind).toBe("project");
      expect(updated.value.targetRef).toBe("team/repo");
      expect(updated.value.strategy).toBe("pull");
      expect(updated.value.enabled).toBe(false);
      expect(updated.value.updatedAt).not.toBe(created.value.updatedAt);

      const deleted = await todu.integration.delete(created.value.id);
      expect(deleted.ok).toBe(true);

      const missing = await todu.integration.get(created.value.id);
      expect(missing.ok).toBe(false);
      if (missing.ok) return;
      expect(missing.error.type).toBe("not-found");

      const missingStatus = await todu.integration.getStatus(created.value.id);
      expect(missingStatus.ok).toBe(false);
      if (missingStatus.ok) return;
      expect(missingStatus.error.type).toBe("not-found");
    });
  });

  describe("status", () => {
    it("updates binding status fields", async () => {
      const created = await createBinding();
      if (!created.ok) throw new Error("Failed to create binding");

      const initialStatus = await todu.integration.getStatus(created.value.id);
      if (!initialStatus.ok) throw new Error("Failed to get initial status");

      const updated = await todu.integration.updateStatus(created.value.id, {
        state: "running",
        authorityId: "authority-daemon-1",
        lastAttemptedSyncAt: "2026-03-08T12:00:00Z",
        lastSuccessfulSyncAt: "2026-03-08T12:01:00Z",
        lastErrorSummary: "Temporary warning",
      });
      expect(updated.ok).toBe(true);
      if (!updated.ok) return;

      expect(updated.value.state).toBe("running");
      expect(updated.value.authorityId).toBe("authority-daemon-1");
      expect(updated.value.lastAttemptedSyncAt).toBe("2026-03-08T12:00:00Z");
      expect(updated.value.lastSuccessfulSyncAt).toBe("2026-03-08T12:01:00Z");
      expect(updated.value.lastErrorSummary).toBe("Temporary warning");
      expect(updated.value.updatedAt).not.toBe(initialStatus.value.updatedAt);
    });

    it("returns validation errors for invalid status updates", async () => {
      const created = await createBinding();
      if (!created.ok) throw new Error("Failed to create binding");

      const invalid = await todu.integration.updateStatus(created.value.id, {
        state: "pending" as "idle",
      });
      expect(invalid.ok).toBe(false);
      if (invalid.ok) return;
      expect(invalid.error.type).toBe("validation");
      expect(invalid.error.field).toBe("state");
    });
  });

  describe("uniqueness", () => {
    it("rejects creating a second binding for the same project", async () => {
      const first = await createBinding();
      if (!first.ok) throw new Error("Failed to create first binding");

      const second = await todu.integration.create({
        provider: "forgejo",
        projectId,
        targetKind: "repository",
        targetRef: "owner/other",
      });
      expect(second.ok).toBe(false);
      if (second.ok) return;
      expect(second.error.type).toBe("validation");
      expect(second.error.field).toBe("projectId");
    });

    it("rejects updating a binding onto a project that already has a binding", async () => {
      const first = await createBinding();
      const second = await todu.integration.create({
        provider: "forgejo",
        projectId: otherProjectId,
        targetKind: "repository",
        targetRef: "owner/other",
      });
      if (!first.ok || !second.ok) throw new Error("Failed to create bindings");

      const moved = await todu.integration.update(second.value.id, { projectId });
      expect(moved.ok).toBe(false);
      if (moved.ok) return;
      expect(moved.error.type).toBe("validation");
      expect(moved.error.field).toBe("projectId");
    });
  });

  describe("not found behavior", () => {
    const missingBindingId = createIntegrationBindingId("ibind-missing") as IntegrationBindingId;

    it("returns not-found for unknown bindings", async () => {
      const result = await todu.integration.get(missingBindingId);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("not-found");
    });

    it("returns not-found for missing status records", async () => {
      const result = await todu.integration.getStatus(missingBindingId);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("not-found");
    });
  });
});
