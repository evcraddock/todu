import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { type DocumentId, Repo } from "@automerge/automerge-repo";
import { NodeFSStorageAdapter } from "@automerge/automerge-repo-storage-nodefs";
import type {
  CatalogDocument,
  Result,
  SyncProviderV5,
  SyncTaskFieldGroupUpdate,
  TaskDetailDocument,
  TaskListDocument,
} from "@todu/core";
import { createTodu, type ToduWithInternalTools } from "@todu/engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDaemonLogger } from "./logger.js";
import { createSyncPluginWorkerRuntime } from "./sync-worker-runtime.js";

function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}
const LOCAL_TIME = "2026-04-03T00:00:00.000Z";
const REMOTE_TIME = "2026-04-01T00:00:00.000Z";

describe("v5 persistence and split-document replay", () => {
  let directory: string;
  let todu: ToduWithInternalTools | null;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "todu-field-groups-"));
    todu = null;
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await todu?.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it.each([
    ["title", false, false],
    ["description", false, false],
    ["title", true, false],
    ["description", true, false],
    ["title", false, true],
  ] as const)("repairs persisted %s-only content using fresh edits (local=%s, remote=%s)", async (persisted, newerLocal, newerRemote) => {
    const selectedTitle = newerLocal
      ? "New local title"
      : newerRemote
        ? "New remote title"
        : "Remote";
    const selectedBody = newerLocal
      ? "New local body"
      : newerRemote
        ? "New remote body"
        : "Remote body";
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
        title: "Base",
        description: "Base body",
        externalId: "remote-task",
        updatedAt: LOCAL_TIME,
      }),
    );
    const catalogId = todu.sync.getCatalogId();
    const provider: SyncProviderV5 = {
      name: "test",
      version: "1.0.0",
      initialize: vi.fn().mockResolvedValue(undefined),
      shutdown: vi.fn().mockResolvedValue(undefined),
      pull: vi.fn().mockResolvedValue({
        tasks: [],
        checkpoint: "uncommitted",
        taskUpdates: [
          {
            externalId: "remote-task",
            groups: {
              content: {
                base: { title: "Base", description: "Base body" },
                remote: { title: "Remote", description: "Remote body" },
                sourceTimestamp: REMOTE_TIME,
              },
            },
          },
        ],
      }),
      acknowledgePull: vi.fn().mockImplementation(async () => {
        const saved = value(await todu!.task.get(task.id));
        expect(saved.title).toBe(selectedTitle);
        expect(saved.description).toBe(selectedBody);
      }),
      push: vi.fn().mockResolvedValue({ taskLinks: [], commentLinks: [] }),
    };
    const failedFlush = vi
      .spyOn(todu.__internal.syncRuntime, "flush")
      .mockRejectedValueOnce(new Error("injected local flush failure"));
    await cycle(provider, binding.id, "error");
    expect(provider.acknowledgePull).not.toHaveBeenCalled();
    expect(provider.push).not.toHaveBeenCalled();
    expect(value(await todu.__internal.syncRuntime.contentRecovery.read(binding.id))).toHaveLength(
      1,
    );
    failedFlush.mockRestore();
    await todu.close();
    todu = null;

    // Reconstruct one side of a split-document save while retaining the pre-application recovery record.
    const repo = new Repo({ storage: new NodeFSStorageAdapter(directory) });
    try {
      const catalog = await repo.find<CatalogDocument>(catalogId as DocumentId);
      const list = await repo.find<TaskListDocument>(
        catalog.doc()!.taskListDocIds[project.id] as DocumentId,
      );
      const detail = await repo.find<TaskDetailDocument>(
        list.doc()!.detailDocIds[task.id] as DocumentId,
      );
      list.change((doc) => {
        const metadata = doc.tasks.find((row) => row.id === task.id)!;
        metadata.title = persisted === "title" ? "Remote" : "Base";
        metadata.updatedAt = LOCAL_TIME;
      });
      detail.change((doc) => {
        doc.description = persisted === "description" ? "Remote body" : "Base body";
      });
      await repo.flush();
    } finally {
      await repo.shutdown();
    }

    todu = (await createTodu({ storagePath: directory })) as ToduWithInternalTools;
    if (newerLocal)
      value(
        await todu.task.update(task.id, {
          title: "New local title",
          description: "New local body",
          updatedAt: "2026-04-04T00:00:00.000Z",
        }),
      );
    if (newerRemote)
      vi.mocked(provider.pull).mockResolvedValue({
        tasks: [],
        checkpoint: "fresh-window",
        taskUpdates: [
          {
            externalId: "remote-task",
            groups: {
              content: {
                base: { title: "Base", description: "Base body" },
                remote: { title: "New remote title", description: "New remote body" },
                sourceTimestamp: "2026-04-02T00:00:00.000Z",
              },
            },
          },
        ],
      });
    await cycle(provider, binding.id, "idle");
    expect(provider.acknowledgePull).toHaveBeenCalledTimes(1);
    const outcome = vi.mocked(provider.acknowledgePull).mock.calls[0][3].taskResults[0].groups
      .content;
    expect(outcome).toMatchObject({
      winner: newerLocal ? "local" : newerRemote ? "remote" : "equal",
      remoteWriteRequired: newerLocal,
    });
    expect(value(await todu.__internal.syncRuntime.contentRecovery.read(binding.id))).toEqual([]);
    await todu.close();
    todu = (await createTodu({ storagePath: directory })) as ToduWithInternalTools;
    expect(value(await todu.task.get(task.id)).description).toBe(selectedBody);
  });

  it("rejects linkage made ambiguous after observing the task", async () => {
    todu = (await createTodu({ storagePath: directory })) as ToduWithInternalTools;
    const project = value(await todu.project.create({ name: "Linkage" }));
    const task = value(
      await todu.task.create({
        projectId: project.id,
        title: "Base",
        externalId: "remote-task",
        updatedAt: REMOTE_TIME,
      }),
    );
    const expected = value(await todu.task.get(task.id));
    value(
      await todu.task.create({
        projectId: project.id,
        title: "Duplicate",
        externalId: "remote-task",
      }),
    );
    expect(
      await todu.__internal.syncRuntime.tasks.updateIfCurrent({
        id: task.id,
        expected,
        input: { status: "done" },
      }),
    ).toMatchObject({ ok: false, error: { field: "syncPrecondition" } });
    expect(value(await todu.task.get(task.id))).toMatchObject({
      status: "active",
      updatedAt: REMOTE_TIME,
    });
  });

  it("rejects a stale body even when an intervening edit has the same millisecond clock", async () => {
    todu = (await createTodu({ storagePath: directory })) as ToduWithInternalTools;
    const project = value(await todu.project.create({ name: "Equal clock" }));
    const task = value(
      await todu.task.create({
        projectId: project.id,
        title: "Base",
        description: "Base body",
        updatedAt: REMOTE_TIME,
      }),
    );
    const expected = value(await todu.task.get(task.id));
    value(
      await todu.task.update(task.id, { description: "New local body", updatedAt: REMOTE_TIME }),
    );
    const result = await todu.__internal.syncRuntime.tasks.updateIfCurrent({
      id: task.id,
      expected,
      input: { title: "Remote", description: "Remote body" },
    });
    expect(result).toMatchObject({
      ok: false,
      error: { type: "validation", field: "syncPrecondition" },
    });
    expect(value(await todu.task.get(task.id))).toMatchObject({
      title: "Base",
      description: "New local body",
      updatedAt: REMOTE_TIME,
    });
  });

  it.each([
    ["workflow", false],
    ["content", false],
    ["workflow", true],
    ["content", true],
  ] as const)("guards %s application against an intervening edit (during document load=%s) and preserves its conflict clock", async (group, duringLoad) => {
    todu = (await createTodu({ storagePath: directory })) as ToduWithInternalTools;
    const project = value(await todu.project.create({ name: "Interleaving" }));
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
        title: "Base",
        description: "Base body",
        externalId: "remote-task",
        updatedAt: REMOTE_TIME,
      }),
    );
    const newLocalTime = "2026-04-04T00:00:00.000Z";
    const update: SyncTaskFieldGroupUpdate = {
      externalId: "remote-task",
      groups:
        group === "workflow"
          ? {
              workflow: {
                base: { status: "active" },
                remote: { status: "done" },
                sourceTimestamp: LOCAL_TIME,
              },
            }
          : {
              content: {
                base: { title: "Base", description: "Base body" },
                remote: { title: "Older remote edit", description: "Remote body" },
                sourceTimestamp: LOCAL_TIME,
              },
            },
    };
    const provider: SyncProviderV5 = {
      name: "test",
      version: "1.0.0",
      initialize: vi.fn().mockResolvedValue(undefined),
      shutdown: vi.fn().mockResolvedValue(undefined),
      pull: vi
        .fn<SyncProviderV5["pull"]>()
        .mockResolvedValue({ tasks: [], taskUpdates: [update], checkpoint: null }),
      acknowledgePull: vi.fn().mockResolvedValue(undefined),
      push: vi.fn().mockResolvedValue({ taskLinks: [], commentLinks: [] }),
    };
    const tools = todu.__internal.syncRuntime.tasks;
    const guardedUpdate = tools.updateIfCurrent.bind(tools);
    vi.spyOn(tools, "updateIfCurrent").mockImplementationOnce(async (params) => {
      expect(params.expected.updatedAt).toBe(REMOTE_TIME);
      const editLocal = async () =>
        value(
          await todu!.task.update(
            task.id,
            group === "workflow"
              ? { title: "New local edit", updatedAt: newLocalTime }
              : { status: "waiting", updatedAt: newLocalTime },
          ),
        );
      if (!duringLoad) {
        await editLocal();
        return guardedUpdate(params);
      }
      const repo = (todu!.task as unknown as { _repo: Repo })._repo;
      const catalog = await repo.find<CatalogDocument>(todu!.sync.getCatalogId() as DocumentId);
      const list = await repo.find<TaskListDocument>(
        catalog.doc()!.taskListDocIds[project.id] as DocumentId,
      );
      const detailId = list.doc()!.detailDocIds[task.id];
      const find = repo.find.bind(repo);
      let injected = false;
      const load = vi
        .spyOn(repo, "find")
        .mockImplementation(async <T>(...args: Parameters<Repo["find"]>) => {
          if (args[0] === detailId && !injected) {
            injected = true;
            await editLocal();
          }
          return find<T>(...args);
        });
      try {
        const result = await guardedUpdate(params);
        expect(injected).toBe(true);
        return result;
      } finally {
        load.mockRestore();
      }
    });
    await cycle(provider, binding.id, "error");
    expect(provider.acknowledgePull).not.toHaveBeenCalled();
    expect(provider.push).not.toHaveBeenCalled();
    expect(value(await todu.task.get(task.id))).toMatchObject({
      updatedAt: newLocalTime,
      ...(group === "workflow"
        ? { title: "New local edit", status: "active" }
        : { title: "Base", description: "Base body", status: "waiting" }),
    });
    await cycle(provider, binding.id, "idle");
    expect(value(await todu.task.get(task.id))).toMatchObject({
      updatedAt: newLocalTime,
      ...(group === "workflow"
        ? { title: "New local edit", status: "done" }
        : { title: "Older remote edit", description: "Remote body", status: "waiting" }),
    });
    const following: SyncTaskFieldGroupUpdate = {
      externalId: "remote-task",
      groups:
        group === "workflow"
          ? {
              content: {
                base: { title: "Base", description: "Base body" },
                remote: { title: "Older remote edit", description: "Remote body" },
                sourceTimestamp: LOCAL_TIME,
              },
            }
          : {
              workflow: {
                base: { status: "active" },
                remote: { status: "done" },
                sourceTimestamp: LOCAL_TIME,
              },
            },
    };
    vi.mocked(provider.pull).mockResolvedValue({
      tasks: [],
      taskUpdates: [following],
      checkpoint: null,
    });
    await cycle(provider, binding.id, "idle");
    const result = vi.mocked(provider.acknowledgePull).mock.calls.at(-1)![3].taskResults[0];
    expect(group === "workflow" ? result.groups.content : result.groups.workflow).toMatchObject({
      winner: "local",
      remoteWriteRequired: true,
      conflict: { localTimestamp: newLocalTime },
    });
    expect(value(await todu.task.get(task.id))).toMatchObject({
      updatedAt: newLocalTime,
      ...(group === "workflow" ? { title: "New local edit" } : { status: "waiting" }),
    });
  });

  it("persists different winners without overwriting omitted groups", async () => {
    todu = (await createTodu({ storagePath: directory })) as ToduWithInternalTools;
    const project = value(await todu.project.create({ name: "Mixed" }));
    const binding = value(
      await todu.integration.create({
        provider: "test",
        projectId: project.id,
        targetKind: "repository",
        targetRef: "owner/repo",
        strategy: "bidirectional",
        enabled: true,
      }),
    );
    const task = value(
      await todu.task.create({
        projectId: project.id,
        title: "Local",
        externalId: "remote-task",
        updatedAt: LOCAL_TIME,
        labels: ["keep"],
      }),
    );
    const provider: SyncProviderV5 = {
      name: "test",
      version: "1.0.0",
      initialize: vi.fn().mockResolvedValue(undefined),
      shutdown: vi.fn().mockResolvedValue(undefined),
      pull: vi.fn().mockResolvedValue({
        tasks: [],
        checkpoint: null,
        taskUpdates: [
          {
            externalId: "remote-task",
            groups: {
              content: {
                base: { title: "Base", description: "" },
                remote: { title: "Remote", description: "" },
                sourceTimestamp: REMOTE_TIME,
              },
              workflow: {
                base: { status: "active" },
                remote: { status: "done" },
                sourceTimestamp: REMOTE_TIME,
              },
            },
          },
        ],
      }),
      acknowledgePull: vi.fn().mockResolvedValue(undefined),
      push: vi.fn().mockResolvedValue({ taskLinks: [], commentLinks: [] }),
    };
    await cycle(provider, binding.id, "idle");
    expect(value(await todu.task.get(task.id))).toMatchObject({
      title: "Local",
      status: "done",
      labels: ["keep"],
    });
    expect(
      vi.mocked(provider.acknowledgePull).mock.calls[0][3].taskResults[0].groups,
    ).toMatchObject({ content: { winner: "local" }, workflow: { winner: "remote" } });
    expect(provider.push).toHaveBeenCalledTimes(1);
    await todu.close();
    todu = (await createTodu({ storagePath: directory })) as ToduWithInternalTools;
    expect(value(await todu.task.get(task.id))).toMatchObject({
      title: "Local",
      status: "done",
      labels: ["keep"],
    });
  });

  it("clears bodies, renames tasks without detail documents, and preserves approval for matching bodies", async () => {
    todu = (await createTodu({ storagePath: directory })) as ToduWithInternalTools;
    const project = value(await todu.project.create({ name: "Content" }));
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
    const empty = value(
      await todu.task.create({
        projectId: project.id,
        title: "Empty",
        externalId: "empty",
        updatedAt: LOCAL_TIME,
      }),
    );
    const clear = value(
      await todu.task.create({
        projectId: project.id,
        title: "Clear",
        description: "Old body",
        externalId: "clear",
        updatedAt: LOCAL_TIME,
      }),
    );
    const approved = value(
      await todu.task.create({
        projectId: project.id,
        title: "Approved",
        description: "Known body",
        descriptionApproval: { state: "pendingApproval", sourceBindingId: binding.id },
        externalId: "approved",
        updatedAt: LOCAL_TIME,
      }),
    );
    value(await todu.approval.approveTaskDescription(approved.id));
    const provider: SyncProviderV5 = {
      name: "test",
      version: "1.0.0",
      initialize: vi.fn().mockResolvedValue(undefined),
      shutdown: vi.fn().mockResolvedValue(undefined),
      pull: vi.fn().mockResolvedValue({
        tasks: [],
        checkpoint: null,
        taskUpdates: [
          {
            externalId: "empty",
            groups: {
              content: {
                base: { title: "Empty", description: "" },
                remote: { title: "Renamed", description: "" },
              },
            },
          },
          {
            externalId: "clear",
            groups: {
              content: {
                base: { title: "Clear", description: "Old body" },
                remote: { title: "Clear", description: "" },
              },
            },
          },
          {
            externalId: "approved",
            groups: {
              content: {
                base: { title: "Approved", description: "Known body" },
                remote: { title: "Renamed approved", description: "Known body" },
              },
            },
          },
        ],
      }),
      acknowledgePull: vi.fn().mockResolvedValue(undefined),
      push: vi.fn().mockResolvedValue({ taskLinks: [], commentLinks: [] }),
    };
    await cycle(provider, binding.id, "idle");
    expect(provider.acknowledgePull).toHaveBeenCalledTimes(1);
    expect(value(await todu.task.get(empty.id))).toMatchObject({
      title: "Renamed",
      description: undefined,
    });
    expect(value(await todu.task.get(clear.id)).description).toBe("");
    expect(value(await todu.task.get(approved.id)).descriptionApproval?.state).toBe("approved");
    expect(value(await todu.__internal.syncRuntime.contentRecovery.read(binding.id))).toEqual([]);
  });

  async function cycle(
    provider: SyncProviderV5,
    bindingId: Parameters<ToduWithInternalTools["integration"]["getStatus"]>[0],
    state: "idle" | "error",
  ): Promise<void> {
    const shutdownCalls = vi.mocked(provider.shutdown).mock.calls.length;
    const pullCalls = vi.mocked(provider.pull).mock.calls.length;
    const handle = createSyncPluginWorkerRuntime({
      pluginName: "test",
      pluginVersion: "1.0.0",
      modulePath: "/test",
      authorityId: "test",
      provider,
      providerApiVersion: 5,
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
        expect(provider.pull).toHaveBeenCalledTimes(pullCalls + 1);
        expect(value(await todu!.integration.getStatus(bindingId)).state).toBe(state);
      });
    } finally {
      handle.stop();
      await vi.waitFor(() => expect(provider.shutdown).toHaveBeenCalledTimes(shutdownCalls + 1));
    }
  }
});
