import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLabelId } from "@todu/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Todu } from "./index.js";
import { createTodu } from "./index.js";

describe("label namespace", () => {
  let tmpDir: string;
  let todu: Todu;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-label-test-"));
    todu = await createTodu({ storagePath: tmpDir });
  });

  afterEach(async () => {
    await todu.close();
    await new Promise((r) => setTimeout(r, 50));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("create", () => {
    it("creates a label with name only", async () => {
      const result = await todu.label.create({ name: "bug" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.name).toBe("bug");
      expect(result.value.id).toMatch(/^lbl-/);
      expect(result.value.color).toBeUndefined();
    });

    it("creates a label with color", async () => {
      const result = await todu.label.create({ name: "urgent", color: "#FF0000" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.color).toBe("#FF0000");
    });

    it("trims whitespace from name", async () => {
      const result = await todu.label.create({ name: "  feature  " });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.name).toBe("feature");
    });

    it("rejects empty name", async () => {
      const result = await todu.label.create({ name: "" });
      expect(result.ok).toBe(false);
    });

    it("rejects duplicate name (case-insensitive)", async () => {
      await todu.label.create({ name: "Bug" });
      const result = await todu.label.create({ name: "bug" });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("validation");
      expect(result.error.message).toContain("already exists");
    });

    it("rejects invalid color", async () => {
      const result = await todu.label.create({ name: "test", color: "red" });
      expect(result.ok).toBe(false);
    });
  });

  describe("list", () => {
    it("returns empty list when no labels exist", async () => {
      const result = await todu.label.list();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual([]);
    });

    it("returns all labels", async () => {
      await todu.label.create({ name: "bug" });
      await todu.label.create({ name: "feature" });

      const result = await todu.label.list();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(2);
    });
  });

  describe("update", () => {
    it("updates label name", async () => {
      const created = await todu.label.create({ name: "bug" });
      if (!created.ok) throw new Error("create failed");

      const result = await todu.label.update(created.value.id, { name: "defect" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.name).toBe("defect");
    });

    it("updates label color", async () => {
      const created = await todu.label.create({ name: "bug" });
      if (!created.ok) throw new Error("create failed");

      const result = await todu.label.update(created.value.id, { color: "#00FF00" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.color).toBe("#00FF00");
    });

    it("rejects duplicate name on update", async () => {
      await todu.label.create({ name: "bug" });
      const created = await todu.label.create({ name: "feature" });
      if (!created.ok) throw new Error("create failed");

      const result = await todu.label.update(created.value.id, { name: "bug" });
      expect(result.ok).toBe(false);
    });

    it("returns NotFound for nonexistent label", async () => {
      const result = await todu.label.update(createLabelId("lbl-nope"), { name: "x" });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("not-found");
    });
  });

  describe("delete", () => {
    it("deletes a label", async () => {
      const created = await todu.label.create({ name: "bug" });
      if (!created.ok) throw new Error("create failed");

      const result = await todu.label.delete(created.value.id);
      expect(result.ok).toBe(true);

      const list = await todu.label.list();
      expect(list.ok).toBe(true);
      if (!list.ok) return;
      expect(list.value).toHaveLength(0);
    });

    it("removes label from tasks on delete", async () => {
      // Create label and project
      const label = await todu.label.create({ name: "bug" });
      if (!label.ok) throw new Error("create failed");
      const project = await todu.project.create({ name: "Test" });
      if (!project.ok) throw new Error("create failed");

      // Create task with the label
      const task = await todu.task.create({
        title: "Task with label",
        projectId: project.value.id,
        labels: ["bug"],
      });
      if (!task.ok) throw new Error("create failed");

      // Delete label
      await todu.label.delete(label.value.id);

      // Verify label removed from task
      const updated = await todu.task.get(task.value.id);
      expect(updated.ok).toBe(true);
      if (!updated.ok) return;
      expect(updated.value.labels).toEqual([]);
    });

    it("returns NotFound for nonexistent label", async () => {
      const result = await todu.label.delete(createLabelId("lbl-nope"));
      expect(result.ok).toBe(false);
    });
  });
});
