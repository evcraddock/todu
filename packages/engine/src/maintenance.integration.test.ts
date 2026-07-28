import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DocumentId, Repo } from "@automerge/automerge-repo/slim";
import type { CatalogDocument, TaskListDocument } from "@todu/core";
import { afterEach, describe, expect, it } from "vitest";
import { createTodu, type Todu } from "./index.js";
import { compactTaskListDocument } from "./maintenance.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("task-list document compaction", () => {
  it("replaces the document while preserving its current logical state", async () => {
    const storagePath = fs.mkdtempSync(path.join(os.tmpdir(), "todu-compaction-"));
    temporaryDirectories.push(storagePath);
    const todu = await createTodu({ storagePath });

    try {
      const projectResult = await todu.project.create({ name: "Compaction test" });
      expect(projectResult.ok).toBe(true);
      if (!projectResult.ok) return;

      const taskResult = await todu.task.create({
        projectId: projectResult.value.id,
        title: "Preserve me",
        description: "Preserve this description reference",
        labels: ["recovery"],
      });
      expect(taskResult.ok).toBe(true);
      if (!taskResult.ok) return;

      const repo = (todu.task as Todu["task"] & { _repo: Repo })._repo;
      const catalog = await repo.find<CatalogDocument>(todu.sync.getCatalogId() as DocumentId);
      await catalog.whenReady();
      const oldDocumentId = catalog.doc()?.taskListDocIds[projectResult.value.id] as DocumentId;
      const oldHandle = await repo.find<TaskListDocument>(oldDocumentId);
      await oldHandle.whenReady();
      const before = JSON.parse(JSON.stringify(oldHandle.doc())) as TaskListDocument;

      const result = await compactTaskListDocument(repo, catalog, projectResult.value.id);
      const replacement = await repo.find<TaskListDocument>(result.newDocumentId);
      await replacement.whenReady();

      expect(result.oldDocumentId).toBe(oldDocumentId);
      expect(result.newDocumentId).not.toBe(oldDocumentId);
      expect(result.taskCount).toBe(1);
      expect(catalog.doc()?.taskListDocIds[projectResult.value.id]).toBe(result.newDocumentId);
      expect(JSON.parse(JSON.stringify(replacement.doc()))).toEqual(before);

      const listed = await todu.task.list({ projectId: projectResult.value.id });
      expect(listed.ok).toBe(true);
      if (listed.ok) {
        expect(listed.value).toHaveLength(1);
        expect(listed.value[0]?.title).toBe("Preserve me");
      }
    } finally {
      await todu.close();
    }
  });
});
