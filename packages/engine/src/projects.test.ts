import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ProjectId } from "@todu/core";
import { createProjectId } from "@todu/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTodu } from "./index.js";
import type { Todu } from "./index.js";

describe("project namespace", () => {
  let tmpDir: string;
  let todu: Todu;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-proj-test-"));
    todu = await createTodu({ storagePath: tmpDir });
  });

  afterEach(async () => {
    await todu.close();
    // Small delay to let Automerge storage flush before removing temp dir
    await new Promise((r) => setTimeout(r, 50));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("create", () => {
    it("creates a project with required fields", async () => {
      const result = await todu.project.create({ name: "My Project" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.name).toBe("My Project");
      expect(result.value.status).toBe("active");
      expect(result.value.priority).toBe("medium");
      expect(result.value.syncStrategy).toBe("none");
      expect(result.value.id).toMatch(/^proj-/);
      expect(result.value.createdAt).toBeTruthy();
      expect(result.value.updatedAt).toBeTruthy();
    });

    it("creates a project with all optional fields", async () => {
      const result = await todu.project.create({
        name: "Full Project",
        description: "A detailed description",
        priority: "high",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.name).toBe("Full Project");
      expect(result.value.description).toBe("A detailed description");
      expect(result.value.priority).toBe("high");
    });

    it("trims whitespace from name", async () => {
      const result = await todu.project.create({ name: "  Trimmed  " });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.name).toBe("Trimmed");
    });

    it("returns validation error for empty name", async () => {
      const result = await todu.project.create({ name: "" });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("validation");
    });

    it("returns validation error for invalid priority", async () => {
      const result = await todu.project.create({
        name: "Test",
        priority: "urgent" as "high",
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("validation");
    });
  });

  describe("list", () => {
    it("returns empty list when no projects exist", async () => {
      const result = await todu.project.list();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual([]);
    });

    it("returns all created projects", async () => {
      await todu.project.create({ name: "Project A" });
      await todu.project.create({ name: "Project B" });

      const result = await todu.project.list();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(2);
      expect(result.value.map((p) => p.name)).toContain("Project A");
      expect(result.value.map((p) => p.name)).toContain("Project B");
    });
  });

  describe("get", () => {
    it("returns a project by ID", async () => {
      const created = await todu.project.create({ name: "Find Me" });
      if (!created.ok) throw new Error("create failed");

      const result = await todu.project.get(created.value.id);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.name).toBe("Find Me");
      expect(result.value.id).toBe(created.value.id);
    });

    it("returns NotFound for nonexistent ID", async () => {
      const result = await todu.project.get(createProjectId("proj-nonexistent"));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("not-found");
      expect(result.error.entity).toBe("project");
    });
  });

  describe("update", () => {
    let projectId: ProjectId;

    beforeEach(async () => {
      const result = await todu.project.create({ name: "Original" });
      if (!result.ok) throw new Error("create failed");
      projectId = result.value.id;
    });

    it("updates project name", async () => {
      const result = await todu.project.update(projectId, { name: "Updated" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.name).toBe("Updated");
    });

    it("updates project status", async () => {
      const result = await todu.project.update(projectId, { status: "done" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.status).toBe("done");
    });

    it("updates project priority", async () => {
      const result = await todu.project.update(projectId, { priority: "high" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.priority).toBe("high");
    });

    it("updates description", async () => {
      const result = await todu.project.update(projectId, { description: "New desc" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.description).toBe("New desc");
    });

    it("updates multiple fields at once", async () => {
      const result = await todu.project.update(projectId, {
        name: "New Name",
        status: "done",
        priority: "low",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.name).toBe("New Name");
      expect(result.value.status).toBe("done");
      expect(result.value.priority).toBe("low");
    });

    it("updates updatedAt timestamp", async () => {
      const before = await todu.project.get(projectId);
      if (!before.ok) throw new Error("get failed");

      // Small delay to ensure timestamp differs
      await new Promise((r) => setTimeout(r, 10));

      const result = await todu.project.update(projectId, { name: "Changed" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.updatedAt >= before.value.updatedAt).toBe(true);
    });

    it("returns NotFound for nonexistent project", async () => {
      const result = await todu.project.update(createProjectId("proj-nope"), { name: "X" });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("not-found");
    });

    it("returns validation error for empty input", async () => {
      const result = await todu.project.update(projectId, {});
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("validation");
    });

    it("returns validation error for invalid status", async () => {
      const result = await todu.project.update(projectId, {
        status: "inprogress" as "done",
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("validation");
    });
  });

  describe("delete", () => {
    it("deletes an existing project", async () => {
      const created = await todu.project.create({ name: "To Delete" });
      if (!created.ok) throw new Error("create failed");

      const result = await todu.project.delete(created.value.id);
      expect(result.ok).toBe(true);

      // Verify it's gone
      const list = await todu.project.list();
      expect(list.ok).toBe(true);
      if (!list.ok) return;
      expect(list.value).toHaveLength(0);
    });

    it("returns NotFound for nonexistent project", async () => {
      const result = await todu.project.delete(createProjectId("proj-nope"));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("not-found");
    });
  });

  describe("persistence", () => {
    it("projects survive close and reopen", async () => {
      await todu.project.create({ name: "Persistent" });
      await todu.close();

      // Reopen with same storage path
      todu = await createTodu({ storagePath: tmpDir });
      const result = await todu.project.list();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(1);
      expect(result.value[0].name).toBe("Persistent");
    });
  });
});
