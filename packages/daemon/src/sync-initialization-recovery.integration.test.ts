import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { type DocumentId, Repo } from "@automerge/automerge-repo";
import { NodeFSStorageAdapter } from "@automerge/automerge-repo-storage-nodefs";
import type {
  CatalogDocument,
  IntegrationBinding,
  Project,
  Result,
  SyncProviderPullAcknowledgmentV7,
  SyncProviderPullResultV4,
  SyncProviderPullResultV7,
  SyncProviderRecoveryState,
  SyncProviderV4,
  SyncProviderV7,
  SyncTaskFieldGroupUpdateV7,
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

const OLD = "2026-01-01T00:00:00.000Z";
const REMOTE = "2026-04-01T00:00:00.000Z";
const LOCAL = "2026-06-01T00:00:00.000Z";
const BEFORE = { window: "before-original", offset: 3 };
const CHECKPOINT = { window: "opaque-original", offset: 19, comments: ["a", "b"] };
type FrozenV7 = Omit<SyncProviderPullResultV7, "taskUpdates"> & {
  taskUpdates: Omit<SyncTaskFieldGroupUpdateV7, "observationToken">[];
};
type Pending =
  | { schema: 4; id: string; payload: SyncProviderPullResultV4 }
  | { schema: 7; id: string; payload: FrozenV7 };
type Receipt = SyncProviderPullAcknowledgmentV7["taskResults"][number];
interface DurableState {
  pendingBytes: string | null;
  readCursor: unknown;
  receipts: SyncProviderPullAcknowledgmentV7[];
  mirrored: Receipt[];
  remoteWrites: Receipt[];
  deferred: Receipt[];
}

/** Fixture-only journal: pending bytes are immutable; receipt history is not a read cursor. */
class DurableProvider {
  readonly file: string;
  failAck = false;
  failPush = false;
  readonly observations: string[] = [];

  constructor(directory: string, pending?: Pending) {
    this.file = path.join(directory, "provider.json");
    if (pending) {
      if (fs.existsSync(this.file)) throw new Error("Refusing to replace fixture pending work");
      this.save({
        pendingBytes: JSON.stringify(pending),
        readCursor: BEFORE,
        receipts: [],
        mirrored: [],
        remoteWrites: [],
        deferred: [],
      });
    }
  }

  state(): DurableState {
    return JSON.parse(fs.readFileSync(this.file, "utf8")) as DurableState;
  }

  save(state: DurableState): void {
    fs.writeFileSync(this.file, JSON.stringify(state));
  }

  stage(pending: Pending): void {
    const state = this.state();
    if (state.pendingBytes !== null) throw new Error("Fixture drain must finish before cutover");
    this.save({ ...state, pendingBytes: JSON.stringify(pending) });
  }

  pending(): Pending {
    const bytes = this.state().pendingBytes;
    if (!bytes) throw new Error("Bounded fixture must not fetch a fresh remote window");
    return JSON.parse(bytes) as Pending;
  }

  async recovery(): Promise<SyncProviderRecoveryState> {
    try {
      const state = this.state();
      if (state.pendingBytes === null) return { state: "ready" };
      const pending = this.pending();
      if (pending.schema === 4) return { state: "legacy-pending", batchIds: [pending.id] };
      if (pending.schema === 7) return { state: "ready" };
      return { state: "unknown", reason: "Unrecognized fixture pending schema" };
    } catch (error) {
      return { state: "unknown", reason: `Unreadable fixture journal: ${String(error)}` };
    }
  }

  private acknowledge(checkpoint: unknown, receipt?: SyncProviderPullAcknowledgmentV7): void {
    expect(checkpoint).toEqual(this.pending().payload.checkpoint);
    if (this.failAck) throw new Error("injected fixture acknowledgment failure");
    const state = this.state();
    const outcomes = receipt ? [...receipt.bootstrapResults, ...receipt.taskResults] : [];
    const select = (
      predicate: (group: NonNullable<Receipt["groups"][keyof Receipt["groups"]]>) => boolean,
    ): Receipt[] =>
      outcomes.flatMap((outcome) => {
        const groups = Object.fromEntries(
          Object.entries(outcome.groups).filter(([, group]) => predicate(group)),
        );
        return Object.keys(groups).length ? [{ ...outcome, groups }] : [];
      });
    this.save({
      pendingBytes: null,
      readCursor: checkpoint,
      receipts: receipt ? [...state.receipts, receipt] : state.receipts,
      mirrored: [
        ...state.mirrored,
        ...select((group) => group.state === "persisted" && group.baseline === "mirrored"),
      ],
      remoteWrites: [
        ...state.remoteWrites,
        ...select((group) => group.state === "persisted" && group.remoteWriteRequired),
      ],
      deferred: [
        ...state.deferred,
        ...select((group) => group.state === "deferred" || group.baseline === "unproven"),
      ],
    });
  }

  v4(): SyncProviderV4 {
    return {
      name: "recovery-fixture",
      version: "1.0.0",
      initialize: vi.fn(async () => {}),
      shutdown: vi.fn(async () => {}),
      pull: vi.fn(async () => {
        const pending = this.pending();
        if (pending.schema !== 4) throw new Error("Only the frozen original v4 batch may drain");
        return pending.payload;
      }),
      acknowledgePull: vi.fn(async (_binding, checkpoint) => this.acknowledge(checkpoint)),
      push: vi.fn(async () => {
        throw new Error("Bounded v4 drain must not push");
      }),
    };
  }

  v7(): SyncProviderV7 {
    return {
      name: "recovery-fixture",
      version: "1.0.0",
      initialize: vi.fn(async () => {}),
      shutdown: vi.fn(async () => {}),
      recoveryState: vi.fn(async () => this.recovery()),
      pull: vi.fn(async (_binding, _project, context) => {
        const pending = this.pending();
        if (pending.schema !== 7) throw new Error("Legacy bytes cannot become v7 groups");
        const taskUpdates: SyncTaskFieldGroupUpdateV7[] = [];
        for (const update of pending.payload.taskUpdates) {
          const observed = await context.observeTaskGroups({
            externalId: update.externalId,
            localTaskId: update.localTaskId,
          });
          if (observed.state !== "found")
            throw new Error(`Unproven fixture identity: ${observed.state}`);
          this.observations.push(observed.task.observationToken);
          taskUpdates.push({ ...update, observationToken: observed.task.observationToken });
        }
        return { ...pending.payload, taskUpdates };
      }),
      acknowledgePull: vi.fn(async (_binding, checkpoint, _project, receipt) =>
        this.acknowledge(checkpoint, receipt),
      ),
      push: vi.fn(async () => {
        if (this.failPush) throw new Error("injected fixture remote write failure");
        // No remote endpoint exists: a successful no-op is not proof that queued writes mirrored.
        return { taskLinks: [], commentLinks: [] };
      }),
    };
  }
}

function v7Batch(groups: SyncTaskFieldGroupUpdateV7["groups"]): Pending {
  return {
    schema: 7,
    id: "original-v7",
    payload: {
      tasks: [],
      taskUpdates: [{ externalId: "existing", groups }],
      cancelledTaskExclusions: [],
      checkpoint: CHECKPOINT,
    },
  };
}

const localWins: SyncTaskFieldGroupUpdateV7["groups"] = {
  content: {
    base: { state: "known", value: { title: "Base", description: "Base body" } },
    remote: { title: "Remote", description: "Remote body" },
    sourceTimestamp: REMOTE,
  },
  workflow: {
    base: { state: "known", value: { status: "active" } },
    remote: { status: "inprogress" },
  },
};

describe("durable isolated v4 drain and v7 initialization recovery", () => {
  let directory: string;
  let todu: ToduWithInternalTools | null;
  let project: Project;
  let binding: IntegrationBinding;

  beforeEach(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "todu-init-recovery-"));
    for (const key of Object.keys(process.env))
      if (key.startsWith("TODU_")) vi.stubEnv(key, undefined);
    for (const key of [
      "HOME",
      "XDG_CONFIG_HOME",
      "XDG_DATA_HOME",
      "XDG_STATE_HOME",
      "XDG_CACHE_HOME",
      "XDG_RUNTIME_DIR",
    ]) {
      const root = path.join(directory, key);
      fs.mkdirSync(root, { mode: 0o700 });
      vi.stubEnv(key, root);
    }
    todu = await open();
    project = value(await todu.project.create({ name: "Disposable recovery fixture" }));
    binding = value(
      await todu.integration.create({
        provider: "recovery-fixture",
        projectId: project.id,
        targetKind: "repository",
        targetRef: "fixture/never-networked",
        strategy: "pull",
        enabled: true,
      }),
    );
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    try {
      await close();
    } finally {
      vi.unstubAllEnvs();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  async function open(): Promise<ToduWithInternalTools> {
    return (await createTodu({
      storagePath: path.join(directory, "storage"),
      remoteSyncSettings: { enabled: false },
    })) as ToduWithInternalTools;
  }

  async function close(): Promise<void> {
    if (todu) {
      await todu.close();
      todu = null;
    }
  }

  async function restart(): Promise<void> {
    await close();
    todu = await open();
  }

  async function cycle(
    provider: SyncProviderV4 | SyncProviderV7,
    version: 4 | 7,
    expected: "idle" | "error" | "blocked",
  ): Promise<void> {
    let terminal: string | undefined;
    const original = todu!.integration.updateStatus;
    const status = vi
      .spyOn(todu!.integration, "updateStatus")
      .mockImplementation(async (id, input) => {
        const result = await original(id, input);
        if (result.ok && input.state !== "running") terminal = result.value.state;
        return result;
      });
    const handle = createSyncPluginWorkerRuntime({
      pluginName: provider.name,
      pluginVersion: provider.version,
      modulePath: "/fixture-only",
      authorityId: "recovery-test",
      provider,
      providerApiVersion: version,
      getTodu: () => todu,
      logger: createDaemonLogger({ level: "error" }),
      config: {
        enabled: true,
        settings: {},
        intervalMs: 600_000,
        retryInitialMs: 600_000,
        retryMaxMs: 600_000,
      },
    }).start();
    try {
      await vi.waitFor(() => expect(terminal).toBe(expected));
    } finally {
      await handle.stop();
      status.mockRestore();
    }
  }

  async function seedLocalWinner() {
    return value(
      await todu!.task.create({
        projectId: project.id,
        externalId: "existing",
        title: "Local",
        description: "Local body",
        updatedAt: LOCAL,
      }),
    );
  }

  it.each(["flush", "ack"] as const)(
    "drains only the original v4 batch across %s failure, then initializes from fresh observations",
    async (failure) => {
      const existing = value(
        await todu!.task.create({
          projectId: project.id,
          externalId: "existing",
          title: "Old",
          description: "Old body",
          updatedAt: OLD,
        }),
      );
      const newer = value(
        await todu!.task.create({
          projectId: project.id,
          externalId: "newer",
          title: "Newer local",
          description: "Newer local body",
          updatedAt: LOCAL,
        }),
      );
      const note = value(
        await todu!.note.create({
          entityType: "task",
          entityId: existing.id,
          content: "Old comment",
          tags: ["sync:externalId:existing-comment"],
          createdAt: OLD,
          updatedAt: OLD,
        }),
      );
      const catalogId = todu!.sync.getCatalogId();
      await todu!.__internal.syncRuntime.flush();
      await close();

      // Persist only the task-list half of an interrupted legacy update, leaving the real detail old.
      const repo = new Repo({ storage: new NodeFSStorageAdapter(path.join(directory, "storage")) });
      try {
        const catalog = await repo.find<CatalogDocument>(catalogId as DocumentId);
        const list = await repo.find<TaskListDocument>(
          catalog.doc()!.taskListDocIds[project.id] as DocumentId,
        );
        list.change((doc) => {
          const row = doc.tasks.find((task) => task.id === existing.id)!;
          row.title = "Remote";
          row.status = "inprogress";
          row.updatedAt = REMOTE;
          doc.descriptionSearchTextByTaskId[existing.id] = "remote body";
        });
        await repo.flush();
      } finally {
        await repo.shutdown();
      }
      todu = await open();
      expect(value(await todu.task.get(existing.id))).toMatchObject({
        title: "Remote",
        description: "Old body",
        updatedAt: REMOTE,
      });

      let journal = new DurableProvider(directory, {
        schema: 4,
        id: "frozen-legacy-batch",
        payload: {
          tasks: [
            {
              externalId: "existing",
              title: "Remote",
              description: "Remote body",
              status: "inprogress",
              updatedAt: REMOTE,
            },
            {
              externalId: "newer",
              title: "Stale remote",
              description: "Stale remote body",
              updatedAt: REMOTE,
            },
            { externalId: "new", title: "New remote", description: "New body", updatedAt: REMOTE },
          ],
          comments: [
            {
              externalId: "existing-comment",
              externalTaskId: "existing",
              body: "Remote comment",
              createdAt: OLD,
              updatedAt: REMOTE,
            },
            {
              externalId: "new-comment",
              externalTaskId: "new",
              body: "New comment",
              createdAt: REMOTE,
            },
          ],
          checkpoint: CHECKPOINT,
        },
      });
      const originalBytes = fs.readFileSync(journal.file);
      const blocked = journal.v7();
      await cycle(blocked, 7, "blocked");
      expect(blocked.pull).not.toHaveBeenCalled();
      expect(blocked.acknowledgePull).not.toHaveBeenCalled();
      expect(blocked.push).not.toHaveBeenCalled();
      expect(await journal.recovery()).toEqual({
        state: "legacy-pending",
        batchIds: ["frozen-legacy-batch"],
      });

      journal.failAck = failure === "ack";
      const flush =
        failure === "flush"
          ? vi
              .spyOn(todu.__internal.syncRuntime, "flush")
              .mockRejectedValueOnce(new Error("injected fixture flush failure"))
          : undefined;
      const failed = journal.v4();
      await cycle(failed, 4, "error");
      flush?.mockRestore();
      expect(failed.pull).toHaveBeenCalledTimes(1);
      expect(failed.acknowledgePull).toHaveBeenCalledTimes(failure === "ack" ? 1 : 0);
      expect(failed.push).not.toHaveBeenCalled();
      expect(value(await todu.integration.getStatus(binding.id)).lastErrorSummary).toContain(
        failure === "flush"
          ? "injected fixture flush failure"
          : "injected fixture acknowledgment failure",
      );
      expect(fs.readFileSync(journal.file)).toEqual(originalBytes);
      expect(value(await todu.task.get(existing.id)).description).toBe("Remote body");
      const taskIds = value(await todu.task.list({ projectId: project.id }))
        .map((task) => task.id)
        .sort();
      const newTask = value(await todu.task.list({ projectId: project.id })).find(
        (task) => task.externalId === "new",
      )!;
      const newNote = value(await todu.note.list({ entityType: "task", entityId: newTask.id }))[0];
      expect(
        value(await todu.note.list({ entityType: "task", entityId: existing.id })),
      ).toMatchObject([{ id: note.id, content: "Remote comment" }]);

      await restart();
      journal = new DurableProvider(directory);
      expect(fs.readFileSync(journal.file)).toEqual(originalBytes);
      expect(value(await todu!.task.get(existing.id)).description).toBe("Remote body");
      value(await todu!.note.update(note.id, { content: "Newer local comment", updatedAt: LOCAL }));
      const drained = journal.v4();
      await cycle(drained, 4, "idle");
      expect(drained.pull).toHaveBeenCalledTimes(1);
      expect(drained.acknowledgePull).toHaveBeenCalledTimes(1);
      const pulled = await vi.mocked(drained.pull).mock.results[0].value;
      expect(vi.mocked(drained.acknowledgePull).mock.calls[0][1]).toBe(pulled.checkpoint);
      expect(pulled).toEqual(
        (JSON.parse(JSON.parse(originalBytes.toString()).pendingBytes) as Pending).payload,
      );
      expect(journal.state()).toMatchObject({
        pendingBytes: null,
        readCursor: CHECKPOINT,
        mirrored: [],
        receipts: [],
        remoteWrites: [],
      });
      expect(value(await todu!.task.get(newer.id))).toMatchObject({
        title: "Newer local",
        description: "Newer local body",
        updatedAt: LOCAL,
      });
      expect(
        value(await todu!.task.list({ projectId: project.id }))
          .map((task) => task.id)
          .sort(),
      ).toEqual(taskIds);
      expect(
        value(await todu!.note.list({ entityType: "task", entityId: existing.id })),
      ).toMatchObject([{ id: note.id, content: "Newer local comment" }]);
      expect(
        value(await todu!.note.list({ entityType: "task", entityId: newTask.id })),
      ).toMatchObject([{ id: newNote.id, content: "New comment" }]);

      journal.stage(
        v7Batch({ workflow: { base: { state: "unknown" }, remote: { status: "inprogress" } } }),
      );
      const initialized = journal.v7();
      await cycle(initialized, 7, "idle");
      expect(initialized.acknowledgePull).toHaveBeenCalledTimes(1);
      const receipt = journal.state().receipts[0].taskResults[0];
      expect(receipt).toEqual({
        externalId: "existing",
        localTaskId: existing.id,
        groups: {
          workflow: {
            state: "persisted",
            value: { status: "inprogress" },
            baseline: "mirrored",
            remoteWriteRequired: false,
          },
        },
      });
      expect(journal.state().mirrored).toEqual([receipt]);
      expect(value(await todu!.task.get(existing.id)).description).toBe("Remote body");
      await restart();
      expect(value(await todu!.task.list({ projectId: project.id }))).toHaveLength(3);
      expect(value(await todu!.note.list({ entityType: "task", entityId: newTask.id }))[0].id).toBe(
        newNote.id,
      );
    },
  );

  it("replays original v7 bytes after ack failure and never promotes queued local winners when push fails", async () => {
    const task = await seedLocalWinner();
    binding = value(await todu!.integration.update(binding.id, { strategy: "bidirectional" }));
    let journal = new DurableProvider(directory, v7Batch(localWins));
    journal.failAck = true;
    const originalBytes = fs.readFileSync(journal.file);
    const failed = journal.v7();
    await cycle(failed, 7, "error");
    expect(failed.acknowledgePull).toHaveBeenCalledTimes(1);
    expect(failed.push).not.toHaveBeenCalled();
    expect(fs.readFileSync(journal.file)).toEqual(originalBytes);
    expect(value(await todu!.task.get(task.id))).toMatchObject({
      title: "Local",
      description: "Local body",
      status: "inprogress",
      updatedAt: LOCAL,
    });
    const firstToken = journal.observations[0];

    await restart();
    journal = new DurableProvider(directory);
    expect(fs.readFileSync(journal.file)).toEqual(originalBytes);
    journal.failPush = true;
    const replay = journal.v7();
    await cycle(replay, 7, "error");
    expect(journal.observations[0]).not.toBe(firstToken);
    expect(replay.acknowledgePull).toHaveBeenCalledTimes(1);
    expect(replay.push).toHaveBeenCalledTimes(1);
    const acknowledged = journal.state();
    expect(acknowledged).toMatchObject({ pendingBytes: null, readCursor: CHECKPOINT });
    expect(acknowledged.receipts[0].taskResults[0].groups.content).toEqual({
      state: "persisted",
      value: { title: "Local", description: "Local body" },
      baseline: "unproven",
      remoteWriteRequired: true,
      reason: "remote-write-required",
    });
    expect(acknowledged.remoteWrites).toHaveLength(1);
    expect(acknowledged.deferred).toHaveLength(1);
    expect(acknowledged.mirrored).toEqual([
      {
        externalId: "existing",
        localTaskId: task.id,
        groups: {
          workflow: {
            state: "persisted",
            value: { status: "inprogress" },
            baseline: "mirrored",
            remoteWriteRequired: false,
          },
        },
      },
    ]);
    expect(value(await todu!.integration.getStatus(binding.id)).lastErrorSummary).toContain(
      "injected fixture remote write failure",
    );

    await restart();
    journal = new DurableProvider(directory);
    journal.failPush = true;
    binding = value(await todu!.integration.update(binding.id, { strategy: "push" }));
    const retryPush = journal.v7();
    await cycle(retryPush, 7, "error");
    expect(retryPush.pull).not.toHaveBeenCalled();
    expect(retryPush.acknowledgePull).not.toHaveBeenCalled();
    expect(journal.state()).toEqual(acknowledged);
    expect(value(await todu!.task.list({ projectId: project.id }))).toHaveLength(1);
  });

  it.each(["known", "unknown"] as const)(
    "keeps a pull-only %s-base local winner unproven across reopening",
    async (baseState) => {
      const task = await seedLocalWinner();
      let journal = new DurableProvider(
        directory,
        v7Batch({
          content:
            baseState === "known"
              ? localWins.content
              : {
                  base: { state: "unknown" },
                  remote: { title: "Remote", description: "Remote body" },
                },
        }),
      );
      const provider = journal.v7();
      await cycle(provider, 7, "idle");
      expect(provider.push).not.toHaveBeenCalled();
      const persisted = journal.state();
      expect(persisted.receipts[0].taskResults[0]).toEqual({
        externalId: "existing",
        localTaskId: task.id,
        groups: {
          content: {
            state: "persisted",
            value: { title: "Local", description: "Local body" },
            baseline: "unproven",
            remoteWriteRequired: baseState === "known",
            reason: baseState === "known" ? "remote-write-required" : "initialization-disagreement",
          },
        },
      });
      expect(persisted.mirrored).toEqual([]);
      expect(persisted.remoteWrites).toHaveLength(baseState === "known" ? 1 : 0);
      expect(persisted.deferred).toHaveLength(1);
      await restart();
      journal = new DurableProvider(directory);
      expect(journal.state()).toEqual(persisted);
      expect(value(await todu!.task.get(task.id))).toMatchObject({
        title: "Local",
        description: "Local body",
        updatedAt: LOCAL,
      });
    },
  );

  it.each([
    ["pull", "unknown"],
    ["push", "unknown"],
    ["pull", "legacy-pending"],
    ["push", "legacy-pending"],
  ] as const)(
    "blocks v7 %s work for durable %s state without rewriting it",
    async (strategy, recoveryState) => {
      const task = await seedLocalWinner();
      binding = value(await todu!.integration.update(binding.id, { strategy }));
      const journal = new DurableProvider(directory, {
        schema: 4,
        id: "unprovable-old-history",
        payload: {
          tasks: [{ externalId: "existing", title: "Stale remote", updatedAt: OLD }],
          checkpoint: CHECKPOINT,
        },
      });
      if (recoveryState === "unknown") {
        const state = journal.state();
        journal.save({
          ...state,
          pendingBytes: JSON.stringify({
            schema: 99,
            id: "unprovable-old-history",
            payload: { updatedAt: OLD },
          }),
        });
      }
      const bytes = fs.readFileSync(journal.file);
      const provider = journal.v7();
      await cycle(provider, 7, "blocked");
      expect(await journal.recovery()).toMatchObject({ state: recoveryState });
      expect(provider.pull).not.toHaveBeenCalled();
      expect(provider.acknowledgePull).not.toHaveBeenCalled();
      expect(provider.push).not.toHaveBeenCalled();
      expect(fs.readFileSync(journal.file)).toEqual(bytes);
      expect(value(await todu!.task.get(task.id))).toMatchObject({
        title: "Local",
        description: "Local body",
      });
    },
  );
});
