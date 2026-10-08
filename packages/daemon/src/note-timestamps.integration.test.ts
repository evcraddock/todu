import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  ExportedCommentInput,
  ImportedCommentInput,
  Note,
  Result,
  SyncProviderV5,
} from "@todu/core";
import { createTodu, type ToduWithInternalTools } from "@todu/engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDaemonLogger } from "./logger.js";
import { createSyncPluginWorkerRuntime } from "./sync-worker-runtime.js";

function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

const CREATED = "2021-04-17T14:30:00.000Z";
const EDITED = "2021-04-18T08:00:00.000Z";

describe("note timestamps through provider sync", () => {
  let directory: string;
  let todu: ToduWithInternalTools;

  beforeEach(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "todu-note-clocks-"));
    todu = (await createTodu({ storagePath: directory })) as ToduWithInternalTools;
  });

  afterEach(async () => {
    await todu.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it.each([
    3, 4, 5,
  ])("preserves imports, replays, local edits and exports across restart (API v%s)", async (apiVersion) => {
    const project = value(await todu.project.create({ name: "Note clocks" }));
    const task = value(
      await todu.task.create({ projectId: project.id, title: "Task", externalId: "remote-task" }),
    );
    const binding = value(
      await todu.integration.create({
        provider: "test",
        projectId: project.id,
        targetKind: "repository",
        targetRef: "test/repo",
        strategy: "bidirectional",
        enabled: true,
      }),
    );
    const comment: ImportedCommentInput = {
      externalId: "remote-comment",
      externalTaskId: "remote-task",
      body: "Original",
      author: { externalLogin: "remote-author" },
      createdAt: CREATED,
    };
    const provider: SyncProviderV5 = {
      name: "test",
      version: "1.0.0",
      initialize: vi.fn().mockResolvedValue(undefined),
      shutdown: vi.fn().mockResolvedValue(undefined),
      pull: vi.fn().mockImplementation(async () => ({
        tasks: [],
        taskUpdates: [],
        comments: [comment],
        checkpoint: "window",
      })),
      acknowledgePull: vi.fn().mockResolvedValue(undefined),
      push: vi.fn().mockResolvedValue({ taskLinks: [], commentLinks: [] }),
    };
    async function cycle(): Promise<void> {
      vi.mocked(provider.push).mockClear();
      vi.mocked(provider.acknowledgePull).mockClear();
      const handle = createSyncPluginWorkerRuntime({
        pluginName: "test",
        pluginVersion: "1.0.0",
        modulePath: "/test",
        authorityId: "test",
        provider,
        providerApiVersion: apiVersion,
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
          expect(provider.push).toHaveBeenCalledTimes(1);
          expect(value(await todu.integration.getStatus(binding.id)).state).toBe("idle");
        });
        expect(provider.acknowledgePull).toHaveBeenCalledTimes(apiVersion === 3 ? 0 : 1);
      } finally {
        await handle.stop();
      }
    }
    function exportedNote(): ExportedCommentInput {
      return vi.mocked(provider.push).mock.calls[0][1][0].comments[0];
    }
    async function note(): Promise<Note> {
      const notes = value(await todu.note.list({ entityType: "task", entityId: task.id }));
      expect(notes).toHaveLength(1);
      return notes[0];
    }

    await cycle();
    const imported = await note();
    expect(imported.createdAt).toBe(CREATED);
    expect(imported.updatedAt).toBe(CREATED);
    expect(exportedNote()).toMatchObject({
      createdAt: CREATED,
      updatedAt: CREATED,
      body: "Original",
    });

    comment.body = "Remote edit";
    comment.updatedAt = "2021-04-18T10:00:00+02:00";
    await cycle();
    expect(await note()).toMatchObject({
      createdAt: CREATED,
      updatedAt: EDITED,
      content: "Remote edit",
    });
    expect(exportedNote()).toMatchObject({
      createdAt: CREATED,
      updatedAt: EDITED,
      body: "Remote edit",
    });
    await todu.close();
    todu = (await createTodu({ storagePath: directory })) as ToduWithInternalTools;
    expect(await note()).toMatchObject({ createdAt: CREATED, updatedAt: EDITED });

    const update = vi.spyOn(todu.note, "update");
    await cycle();
    expect(update).not.toHaveBeenCalled();
    update.mockRestore();

    const local = value(await todu.note.update(imported.id, { content: "Local edit" }));
    expect(Date.parse(local.updatedAt)).toBeGreaterThan(Date.parse(EDITED));
    await cycle();
    expect(await note()).toMatchObject({
      content: "Local edit",
      createdAt: CREATED,
      updatedAt: local.updatedAt,
    });
    expect(exportedNote()).toMatchObject({
      body: "Local edit",
      createdAt: CREATED,
      updatedAt: local.updatedAt,
    });

    comment.body = "Newest remote";
    comment.updatedAt = "2099-01-01T00:00:00Z";
    await cycle();
    expect(await note()).toMatchObject({
      content: "Newest remote",
      createdAt: CREATED,
      updatedAt: "2099-01-01T00:00:00.000Z",
    });
    expect(exportedNote()).toMatchObject({
      body: "Newest remote",
      updatedAt: "2099-01-01T00:00:00.000Z",
    });
  });
});
