import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Repo } from "@automerge/automerge-repo";
import { NodeFSStorageAdapter } from "@automerge/automerge-repo-storage-nodefs";
import type { CatalogDocument, Result, SyncProviderV4, TaskListDocument } from "@todu/core";
import { createTodu, type ToduWithInternalTools } from "@todu/engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDaemonLogger } from "./logger.js";
import { createSyncPluginWorkerRuntime } from "./sync-worker-runtime.js";

function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

const REMOTE_TIME = "2026-04-01T00:00:00.000Z";

describe("checkpoint replay after partial task persistence", () => {
  let directory: string;
  let todu: ToduWithInternalTools | null;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "todu-checkpoint-replay-"));
    todu = null;
  });

  afterEach(async () => {
    await todu?.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it.each([
    false,
    true,
  ])("repairs equal-timestamp details after restart, but preserves newer local edits (newer=%s)", async (newerLocalEdit) => {
    todu = (await createTodu({ storagePath: directory })) as ToduWithInternalTools;
    const project = value(await todu.project.create({ name: "Replay" }));
    const binding = value(
      await todu.integration.create({
        provider: "test",
        projectId: project.id,
        targetKind: "repository",
        targetRef: "owner/repo",
        strategy: "pull",
        enabled: true,
      }),
    );
    const task = value(
      await todu.task.create({
        projectId: project.id,
        title: "Old title",
        description: "Old description",
        externalId: "remote-task",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    const catalogId = todu.sync.getCatalogId();
    await todu.__internal.syncRuntime.flush();
    await todu.close();
    todu = null;

    // Model a failed split-document save: the new task list persisted, but the old detail remains.
    const repo = new Repo({ storage: new NodeFSStorageAdapter(directory) });
    try {
      const catalog = await repo.find<CatalogDocument>(catalogId);
      const list = await repo.find<TaskListDocument>(catalog.doc()!.taskListDocIds[project.id]);
      list.change((doc) => {
        const metadata = doc.tasks.find((candidate) => candidate.id === task.id)!;
        metadata.title = "New title";
        metadata.updatedAt = REMOTE_TIME;
        doc.descriptionSearchTextByTaskId[task.id] = "new description";
      });
      await repo.flush();
    } finally {
      await repo.shutdown();
    }

    todu = (await createTodu({ storagePath: directory })) as ToduWithInternalTools;
    const partial = value(await todu.task.get(task.id));
    expect(partial.updatedAt).toBe(REMOTE_TIME);
    expect(partial.title).toBe("New title");
    expect(partial.description).toBe("Old description");
    if (newerLocalEdit) {
      value(
        await todu.task.update(task.id, {
          title: "Newer local title",
          description: "Newer local description",
          updatedAt: "2026-04-02T00:00:00.000Z",
        }),
      );
    }

    const provider: SyncProviderV4 = {
      name: "test",
      version: "1.0.0",
      initialize: vi.fn().mockResolvedValue(undefined),
      shutdown: vi.fn().mockResolvedValue(undefined),
      pull: vi.fn().mockResolvedValue({
        tasks: [
          {
            externalId: "remote-task",
            title: "New title",
            description: "New description",
            updatedAt: REMOTE_TIME,
          },
        ],
        checkpoint: "uncommitted-window",
      }),
      acknowledgePull: vi.fn().mockImplementation(async () => {
        const saved = value(await todu!.task.get(task.id));
        expect(saved.description).toBe(
          newerLocalEdit ? "Newer local description" : "New description",
        );
      }),
      push: vi.fn().mockResolvedValue({ taskLinks: [], commentLinks: [] }),
    };
    const handle = createSyncPluginWorkerRuntime({
      pluginName: "test",
      pluginVersion: "1.0.0",
      modulePath: "/test",
      authorityId: "test",
      provider,
      providerApiVersion: 4,
      getTodu: () => todu,
      logger: createDaemonLogger({ level: "error" }),
      config: {
        enabled: true,
        settings: {},
        intervalMs: 60000,
        retryInitialMs: 60000,
        retryMaxMs: 60000,
      },
    }).start();
    try {
      await vi.waitFor(async () => {
        expect(value(await todu!.integration.getStatus(binding.id)).state).toBe("idle");
        expect(provider.acknowledgePull).toHaveBeenCalledTimes(1);
      });
      const saved = value(await todu.task.get(task.id));
      expect(saved.title).toBe(newerLocalEdit ? "Newer local title" : "New title");
      expect(saved.updatedAt).toBe(newerLocalEdit ? "2026-04-02T00:00:00.000Z" : REMOTE_TIME);
      expect(value(await todu.task.list({ projectId: project.id }))).toHaveLength(1);
    } finally {
      await handle.stop();
    }

    await todu.close();
    todu = (await createTodu({ storagePath: directory })) as ToduWithInternalTools;
    expect(value(await todu.task.get(task.id)).description).toBe(
      newerLocalEdit ? "Newer local description" : "New description",
    );
  });
});
