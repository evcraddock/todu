import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  IntegrationBinding,
  Project,
  Result,
  SyncProviderPullContext,
  SyncProviderPullResultV6,
  SyncProviderV6,
  Task,
} from "@todu/core";
import { createTodu, type ToduWithInternalTools } from "@todu/engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDaemonLogger } from "./logger.js";
import { createSyncPluginWorkerRuntime } from "./sync-worker-runtime.js";

function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}
const REMOTE_TIME = "2026-04-01T00:00:00.000Z";

function emptyPull(): SyncProviderPullResultV6 {
  return { tasks: [], taskUpdates: [], checkpoint: "window-1", cancelledTaskExclusions: [] };
}
function missingTargetPull(context: SyncProviderPullContext, task: Task): SyncProviderPullResultV6 {
  const result = context.resolveTask({
    localTaskId: task.id,
    externalId: task.externalId,
    sourceUrl: task.sourceUrl,
  });
  // Fixture remote returns an unavailable target. Only verified current cancellation permits skipping.
  if (result.state !== "found" || result.task.status !== "canceled")
    throw new Error("unavailable remote target requires current verified cancellation");
  return {
    ...emptyPull(),
    cancelledTaskExclusions: [{ observationToken: result.task.observationToken }],
    tasks: [
      {
        externalId: "owner/repo#9",
        title: "Unrelated remote task",
        description: "Remote body",
        updatedAt: REMOTE_TIME,
      },
    ],
  };
}

function provider(pull: SyncProviderV6["pull"]): SyncProviderV6 {
  return {
    name: "fixture",
    version: "1.0.0",
    initialize: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
    pull: vi.fn(pull),
    acknowledgePull: vi.fn().mockResolvedValue(undefined),
    push: vi.fn().mockResolvedValue({ taskLinks: [], commentLinks: [] }),
  };
}

describe("v6 scoped pull decisions against a real persistent engine", () => {
  let directory: string;
  let todu: ToduWithInternalTools;
  let binding: IntegrationBinding;
  let project: Project;
  let task: Task;

  beforeEach(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "todu-local-pull-"));
    todu = (await createTodu({ storagePath: directory })) as ToduWithInternalTools;
    project = value(await todu.project.create({ name: "Bound project" }));
    binding = value(
      await todu.integration.create({
        provider: "fixture",
        projectId: project.id,
        targetKind: "repository",
        targetRef: "owner/repo",
        enabled: true,
        strategy: "pull",
      }),
    );
    task = value(
      await todu.task.create({
        projectId: project.id,
        title: "Retained task",
        description: "Retained history",
        status: "canceled",
        externalId: "owner/repo#8",
        sourceUrl: "https://tracker.test/owner/repo/issues/8",
        updatedAt: REMOTE_TIME,
      }),
    );
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await todu.close();
    fs.rmSync(directory, { recursive: true });
  });

  async function cycle(p: SyncProviderV6, version = 6, enabled = true): Promise<void> {
    const scheduled: (() => void)[] = [];
    const initialized = vi.mocked(p.initialize).mock.calls.length;
    const shutdowns = vi.mocked(p.shutdown).mock.calls.length;
    const handle = createSyncPluginWorkerRuntime({
      pluginName: "fixture",
      pluginVersion: "1.0.0",
      modulePath: "/fixture",
      authorityId: "test",
      provider: p,
      providerApiVersion: version,
      getTodu: () => todu,
      logger: createDaemonLogger({ level: "error" }),
      config: {
        enabled,
        settings: {},
        intervalMs: 60_000,
        retryInitialMs: 60_000,
        retryMaxMs: 60_000,
      },
      scheduler: {
        setTimeoutFn(handler) {
          scheduled.push(handler);
          return 1 as unknown as ReturnType<typeof setTimeout>;
        },
        clearTimeoutFn() {},
      },
    }).start();
    try {
      scheduled[0]();
      await vi.waitFor(() => expect(scheduled).toHaveLength(2));
    } finally {
      handle.stop();
      if (vi.mocked(p.initialize).mock.calls.length > initialized)
        await vi.waitFor(() => expect(p.shutdown).toHaveBeenCalledTimes(shutdowns + 1));
    }
  }

  it("skips only the cancelled unavailable target, retains history, and acknowledges unrelated imports after flush", async () => {
    const note = value(
      await todu.note.create({
        entityType: "task",
        entityId: task.id,
        content: "Existing comment history",
      }),
    );
    let captured: SyncProviderPullContext | undefined;
    const events: string[] = [];
    const flush = todu.__internal.syncRuntime.flush;
    vi.spyOn(todu.__internal.syncRuntime, "flush").mockImplementation(async () => {
      await flush();
      events.push("flush");
    });
    const p = provider(async (_binding, _project, context) => {
      captured = context;
      expect(context.bindingId).toBe(binding.id);
      expect(context.projectId).toBe(project.id);
      return missingTargetPull(context, task);
    });
    vi.mocked(p.acknowledgePull).mockImplementation(
      async (_binding, checkpoint, _project, acknowledgment) => {
        events.push("ack");
        expect(checkpoint).toBe("window-1");
        expect(acknowledgment).toEqual({ taskResults: [] });
        const tasks = value(await todu.task.list({ projectId: project.id }));
        expect(tasks).toHaveLength(2);
        expect(value(await todu.task.get(task.id))).toMatchObject({
          title: "Retained task",
          status: "canceled",
          description: "Retained history",
        });
        expect(value(await todu.note.get(note.id)).content).toBe("Existing comment history");
      },
    );
    await cycle(p);
    expect(value(await todu.integration.getStatus(binding.id))).toMatchObject({
      state: "idle",
      lastErrorSummary: null,
    });
    expect(events).toEqual(["flush", "ack"]);
    expect(p.push).not.toHaveBeenCalled();
    expect(captured!.resolveTask({ localTaskId: task.id })).toEqual({
      state: "unknown",
      reason: "context-expired",
    });
    await todu.close();
    todu = (await createTodu({ storagePath: directory })) as ToduWithInternalTools;
    expect(value(await todu.task.list({ projectId: project.id }))).toHaveLength(2);
    expect(value(await todu.note.get(note.id)).content).toBe("Existing comment history");
  });

  it("rejects reactivation after a scoped read captured its snapshot but before acknowledgment", async () => {
    let flushed = false;
    const flush = todu.__internal.syncRuntime.flush;
    vi.spyOn(todu.__internal.syncRuntime, "flush").mockImplementation(async () => {
      await flush();
      flushed = true;
    });
    const list = todu.task.list;
    vi.spyOn(todu.task, "list").mockImplementation(async (...args) => {
      const snapshot = await list(...args);
      if (flushed) {
        flushed = false;
        value(await todu.task.update(task.id, { status: "active" }));
      }
      return snapshot;
    });
    const p = provider(async (_binding, _project, context) => missingTargetPull(context, task));
    await cycle(p);
    expect(p.acknowledgePull).not.toHaveBeenCalled();
    expect(value(await todu.integration.getStatus(binding.id)).state).toBe("error");
    expect(value(await todu.task.get(task.id)).status).toBe("active");
  });

  it.each(["pull", "flush"])(
    "rejects cancellation followed by reactivation during %s without acknowledgment or push",
    async (boundary) => {
      value(await todu.integration.update(binding.id, { strategy: "bidirectional" }));
      const p = provider(async (_binding, _project, context) => {
        const result = missingTargetPull(context, task);
        if (boundary === "pull") value(await todu.task.update(task.id, { status: "active" }));
        return result;
      });
      if (boundary === "flush") {
        const flush = todu.__internal.syncRuntime.flush;
        vi.spyOn(todu.__internal.syncRuntime, "flush").mockImplementation(async () => {
          value(await todu.task.update(task.id, { status: "active" }));
          await flush();
        });
      }
      await cycle(p);
      expect(value(await todu.integration.getStatus(binding.id))).toMatchObject({
        state: "error",
        lastErrorSummary: expect.stringContaining("stale cancellation"),
      });
      expect(p.acknowledgePull).not.toHaveBeenCalled();
      expect(p.push).not.toHaveBeenCalled();
      expect(value(await todu.task.get(task.id)).status).toBe("active");
      expect(value(await todu.task.list({ projectId: project.id }))).toHaveLength(
        boundary === "pull" ? 1 : 2,
      );
    },
  );

  it.each(["flush", "acknowledgment"])(
    "retains a provider-owned pending batch across %s failure/restart and reevaluates exclusions before replay",
    async (failure) => {
      const pending = path.join(directory, "fixture-pending.json");
      const committed = path.join(directory, "fixture-checkpoint.json");
      function replayProvider(): SyncProviderV6 {
        const p = provider(async (_binding, _project, context) => {
          const fresh = missingTargetPull(context, task);
          if (fs.existsSync(pending)) {
            const staged = JSON.parse(fs.readFileSync(pending, "utf8")) as SyncProviderPullResultV6;
            return { ...staged, cancelledTaskExclusions: fresh.cancelledTaskExclusions };
          }
          fs.writeFileSync(pending, JSON.stringify(fresh));
          return fresh;
        });
        vi.mocked(p.acknowledgePull).mockImplementation(async (_binding, checkpoint) => {
          fs.writeFileSync(committed, JSON.stringify(checkpoint));
        });
        return p;
      }
      const p = replayProvider();
      const flush = vi.spyOn(todu.__internal.syncRuntime, "flush");
      if (failure === "flush") flush.mockRejectedValueOnce(new Error("injected flush failure"));
      else
        vi.mocked(p.acknowledgePull).mockRejectedValueOnce(
          new Error("injected acknowledgment failure"),
        );
      await cycle(p);
      expect(p.acknowledgePull).toHaveBeenCalledTimes(failure === "flush" ? 0 : 1);
      expect(fs.existsSync(pending)).toBe(true);
      expect(fs.existsSync(committed)).toBe(false);
      const originalPending = fs.readFileSync(pending, "utf8");
      flush.mockRestore();
      const imported = value(await todu.task.list({ projectId: project.id })).find(
        (row) => row.externalId === "owner/repo#9",
      )!;
      value(
        await todu.task.update(imported.id, {
          title: "Newer local edit",
          updatedAt: "2026-04-03T00:00:00Z",
        }),
      );
      await todu.close();
      todu = (await createTodu({ storagePath: directory })) as ToduWithInternalTools;
      value(await todu.task.update(task.id, { status: "active" }));
      const replay = replayProvider();
      await cycle(replay);
      expect(replay.acknowledgePull).not.toHaveBeenCalled();
      expect(fs.readFileSync(pending, "utf8")).toBe(originalPending);
      expect(fs.existsSync(committed)).toBe(false);
      value(await todu.task.update(task.id, { status: "canceled" }));
      await cycle(replay);
      expect(replay.acknowledgePull).toHaveBeenCalledTimes(1);
      expect(JSON.parse(fs.readFileSync(committed, "utf8"))).toBe("window-1");
      expect(value(await todu.task.list({ projectId: project.id }))).toHaveLength(2);
      expect(value(await todu.task.get(imported.id)).title).toBe("Newer local edit");
    },
  );

  it("rejects a persisted old receipt after restart even if the task is still cancelled", async () => {
    let saved: SyncProviderPullResultV6 | undefined;
    const p = provider(async (_binding, _project, context) => {
      saved ??= missingTargetPull(context, task);
      return saved;
    });
    vi.spyOn(todu.__internal.syncRuntime, "flush").mockRejectedValueOnce(
      new Error("injected failure"),
    );
    await cycle(p);
    await todu.close();
    todu = (await createTodu({ storagePath: directory })) as ToduWithInternalTools;
    await cycle(p);
    expect(value(await todu.integration.getStatus(binding.id)).lastErrorSummary).toContain(
      "invalid cancellation exclusion receipt",
    );
    expect(p.acknowledgePull).not.toHaveBeenCalled();
  });

  it.each(["active", "done", "inprogress", "waiting"] as const)(
    "does not suppress an unavailable remote endpoint for %s",
    async (status) => {
      value(await todu.task.update(task.id, { status: "active" }));
      if (status !== "active") value(await todu.task.update(task.id, { status }));
      const p = provider(async (_binding, _project, context) => missingTargetPull(context, task));
      await cycle(p);
      expect(value(await todu.integration.getStatus(binding.id)).state).toBe("error");
      expect(p.acknowledgePull).not.toHaveBeenCalled();
      expect(value(await todu.task.list({ projectId: project.id }))).toHaveLength(1);
    },
  );

  it("fails closed for missing, contradictory, ambiguous, and unrelated-project identities", async () => {
    const other = value(await todu.project.create({ name: "Other project" }));
    const foreign = value(
      await todu.task.create({
        projectId: other.id,
        title: "Secret",
        status: "canceled",
        externalId: "foreign",
      }),
    );
    value(
      await todu.task.create({
        projectId: project.id,
        title: "Duplicate",
        externalId: task.externalId,
      }),
    );
    const p = provider(async (_binding, _project, context) => {
      expect(context.resolveTask({ localTaskId: foreign.id })).toEqual({ state: "missing" });
      expect(context.resolveTask({ externalId: "absent" })).toEqual({ state: "missing" });
      expect(context.resolveTask({ localTaskId: task.id, externalId: "contradictory" })).toEqual({
        state: "unknown",
        reason: "identity-mismatch",
      });
      expect(context.resolveTask({ localTaskId: task.id })).toEqual({ state: "ambiguous" });
      return missingTargetPull(context, task);
    });
    await cycle(p);
    expect(p.acknowledgePull).not.toHaveBeenCalled();
  });

  it("keeps v5 field-group application, approval, and winning-value receipts", async () => {
    value(await todu.task.update(task.id, { status: "active" }));
    const p = provider(async () => ({
      ...emptyPull(),
      taskUpdates: [
        {
          externalId: task.externalId!,
          groups: {
            content: {
              base: { title: "Retained task", description: "Retained history" },
              remote: { title: "Remote title", description: "Remote description" },
            },
            workflow: { base: { status: "active" }, remote: { status: "done" } },
          },
        },
      ],
    }));
    await cycle(p);
    expect(value(await todu.integration.getStatus(binding.id))).toMatchObject({ state: "idle" });
    expect(p.acknowledgePull).toHaveBeenCalledTimes(1);
    const ack = vi.mocked(p.acknowledgePull).mock.calls[0][3];
    expect(ack.taskResults[0]).toMatchObject({
      localTaskId: task.id,
      groups: { content: { winner: "remote" }, workflow: { winner: "remote" } },
    });
    expect(value(await todu.task.get(task.id))).toMatchObject({
      title: "Remote title",
      status: "done",
      description: "Remote description",
      descriptionApproval: { state: "pendingApproval" },
    });
  });

  it("defers incomplete assignment mappings and keeps actor authorization host-owned", async () => {
    const actor = value(
      await todu.actor.create({ id: "actor-unmapped", displayName: "Local actor" }),
    );
    value(await todu.project.update(project.id, { authorizedAssigneeActorIds: [actor.id] }));
    value(await todu.task.update(task.id, { assigneeActorIds: [actor.id] }));
    const p = provider(async () => ({
      ...emptyPull(),
      taskUpdates: [
        {
          externalId: task.externalId!,
          groups: {
            assignment: { base: { assignees: [] }, remote: { assignees: [] } },
          },
        },
      ],
    }));
    await cycle(p);
    expect(p.acknowledgePull).toHaveBeenCalledTimes(1);
    expect(vi.mocked(p.acknowledgePull).mock.calls[0][3].taskResults[0]).toMatchObject({
      localTaskId: task.id,
      groups: {},
      deferred: { assignment: "incomplete-assignment-mapping" },
    });
    expect(value(await todu.task.get(task.id)).assigneeActorIds).toEqual([actor.id]);
  });

  it.each(["pull", "bidirectional", "push", "none", "disabled"])(
    "respects %s strategy and does not seed lifecycle context through push",
    async (strategy) => {
      value(
        await todu.integration.update(binding.id, {
          strategy: strategy === "disabled" ? "pull" : (strategy as IntegrationBinding["strategy"]),
          enabled: strategy !== "disabled",
        }),
      );
      const p = provider(async (_binding, _project, context) => {
        expect(context.resolveTask({ localTaskId: task.id })).toMatchObject({ state: "found" });
        return emptyPull();
      });
      await cycle(p);
      const pulls = strategy === "pull" || strategy === "bidirectional";
      expect(p.pull).toHaveBeenCalledTimes(pulls ? 1 : 0);
      expect(p.acknowledgePull).toHaveBeenCalledTimes(pulls ? 1 : 0);
      expect(p.push).toHaveBeenCalledTimes(
        strategy === "push" || strategy === "bidirectional" ? 1 : 0,
      );
    },
  );

  it.each([
    "status",
    "identity",
    "source",
    "clock",
    "missing",
    "duplicate",
    "binding",
    "disabled",
    "host",
  ])("checks live %s metadata at the engine callback boundary", async (change) => {
    const expected = {
      localTaskId: task.id,
      projectId: task.projectId,
      externalId: task.externalId,
      sourceUrl: task.sourceUrl,
      status: task.status,
      updatedAt: task.updatedAt,
      observationToken: "host-only-test",
    };
    if (change === "status")
      value(await todu.task.update(task.id, { status: "active", updatedAt: task.updatedAt }));
    if (change === "identity") value(await todu.task.update(task.id, { externalId: "other" }));
    if (change === "source")
      value(await todu.task.update(task.id, { sourceUrl: "https://other.test" }));
    if (change === "clock")
      value(await todu.task.update(task.id, { updatedAt: "2026-04-02T00:00:00Z" }));
    if (change === "missing") value(await todu.task.delete(task.id));
    if (change === "duplicate")
      value(
        await todu.task.create({
          projectId: project.id,
          title: "Duplicate",
          externalId: task.externalId,
        }),
      );
    if (change === "binding")
      value(await todu.integration.update(binding.id, { targetRef: "owner/other" }));
    if (change === "disabled") value(await todu.integration.update(binding.id, { enabled: false }));
    const run = vi.fn().mockResolvedValue(undefined);
    expect(
      await todu.__internal.syncRuntime.withCurrentTaskLifecycle({
        binding,
        observations: [expected],
        isCurrentHost: () => change !== "host",
        run,
      }),
    ).toMatchObject({ ok: false });
    expect(run).not.toHaveBeenCalled();
  });

  it("does not expose context or process payload extensions without v6 opt-in", async () => {
    const p = provider(async (...args) => {
      expect(args).toHaveLength(2);
      return { ...emptyPull(), cancelledTaskExclusions: [{ observationToken: "ignored-by-v5" }] };
    });
    await cycle(p, 5);
    expect(p.acknowledgePull).toHaveBeenCalledTimes(1);
    expect(value(await todu.integration.getStatus(binding.id)).state).toBe("idle");
  });
});
