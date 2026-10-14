import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createActorId,
  type IntegrationBinding,
  type Project,
  type Result,
  type SyncProviderPullAcknowledgmentV7,
  type SyncProviderPullContextV7,
  type SyncProviderPullResultV7,
  type SyncProviderV7,
  type TaskWithDetail,
} from "@todu/core";
import { createTodu, type ToduWithInternalTools } from "@todu/engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDaemonLogger } from "./logger.js";
import { createSyncPluginWorkerRuntime } from "./sync-worker-runtime.js";

function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}
const empty = (): SyncProviderPullResultV7 => ({
  tasks: [],
  taskUpdates: [],
  cancelledTaskExclusions: [],
  checkpoint: { batch: "uncommitted", cursor: 42 },
});
const unknown = { state: "unknown" } as const;

describe("v7 safe initialization on the real engine", () => {
  let directory: string, todu: ToduWithInternalTools, project: Project, binding: IntegrationBinding;
  beforeEach(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "todu-safe-init-"));
    todu = (await createTodu({
      storagePath: path.join(directory, "storage"),
    })) as ToduWithInternalTools;
    project = value(await todu.project.create({ name: "Scoped fixture" }));
    binding = value(
      await todu.integration.create({
        provider: "fixture",
        projectId: project.id,
        targetKind: "repository",
        targetRef: "owner/repo",
        strategy: "pull",
        enabled: true,
      }),
    );
  });
  afterEach(async () => {
    await todu.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  function provider(pull: SyncProviderV7["pull"]): SyncProviderV7 {
    return {
      name: "fixture",
      version: "1.0.0",
      initialize: vi.fn(async () => {}),
      shutdown: vi.fn(async () => {}),
      recoveryState: vi.fn(async () => ({ state: "ready" as const })),
      pull: vi.fn(pull),
      acknowledgePull: vi.fn(async () => {}),
      push: vi.fn(async () => ({ taskLinks: [], commentLinks: [] })),
    };
  }
  async function run(p: SyncProviderV7): Promise<string> {
    lastState = "running";
    const previous = vi.mocked(p.recoveryState).mock.calls.length;
    const handle = createSyncPluginWorkerRuntime({
      pluginName: "fixture",
      pluginVersion: "1.0.0",
      modulePath: "/fixture",
      authorityId: "fixture",
      provider: p,
      providerApiVersion: 7,
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
      await vi.waitFor(() =>
        expect(vi.mocked(p.recoveryState).mock.calls.length).toBeGreaterThan(previous),
      );
      await vi.waitFor(() => expect(valueStatus()).not.toBe("running"));
      return valueStatus();
    } finally {
      await handle.stop();
    }
  }
  function valueStatus(): string {
    return lastState;
  }
  let lastState = "running";
  beforeEach(() => {
    lastState = "running";
    const original = todu.integration.updateStatus;
    vi.spyOn(todu.integration, "updateStatus").mockImplementation(async (id, input) => {
      const result = await original(id, input);
      if (result.ok) lastState = result.value.state;
      return result;
    });
  });
  async function task(input: Partial<TaskWithDetail> = {}): Promise<TaskWithDetail> {
    const created = value(
      await todu.task.create({
        projectId: project.id,
        title: "Title",
        description: "Body",
        externalId: "remote-1",
        ...input,
      }),
    );
    return value(await todu.task.get(created.id));
  }
  async function observe(context: SyncProviderPullContextV7, local: TaskWithDetail) {
    const observed = await context.observeTaskGroups({
      localTaskId: local.id,
      externalId: local.externalId,
    });
    expect(observed.state).toBe("found");
    if (observed.state !== "found") throw new Error("Missing observation");
    return observed.task;
  }
  function ack(p: SyncProviderV7): SyncProviderPullAcknowledgmentV7 {
    const calls = vi.mocked(p.acknowledgePull).mock.calls;
    expect(calls).toHaveLength(1);
    return calls[0][3];
  }

  it("initializes equal values in pull-only mode without rewriting the task or requiring push", async () => {
    const local = await task();
    let savedContext: SyncProviderPullContextV7 | undefined;
    const p = provider(async (_b, _p, context) => {
      savedContext = context;
      const observed = await observe(context, local);
      expect(Object.isFrozen(observed.groups.content)).toBe(true);
      return {
        ...empty(),
        taskUpdates: [
          {
            externalId: "remote-1",
            localTaskId: local.id,
            observationToken: observed.observationToken,
            groups: {
              content: { base: unknown, remote: { title: "Title", description: "Body" } },
              workflow: { base: unknown, remote: { status: "active" } },
              classification: { base: unknown, remote: { priority: "medium", labels: [] } },
              assignment: { base: unknown, remote: { assignees: [] } },
            },
          },
        ],
      };
    });
    expect(await run(p)).toBe("idle");
    expect(value(await todu.task.get(local.id))).toEqual(local);
    for (const group of Object.values(ack(p).taskResults[0].groups))
      expect(group).toMatchObject({
        state: "persisted",
        baseline: "mirrored",
        remoteWriteRequired: false,
      });
    expect(p.push).not.toHaveBeenCalled();
    expect(await savedContext!.observeTaskGroups({ localTaskId: local.id })).toEqual({
      state: "unknown",
      reason: "context-expired",
    });
  });

  it("preserves unknown-base disagreements and reports actual local values without requesting a destructive write", async () => {
    const local = await task();
    const p = provider(async (_b, _p, ctx) => {
      const observed = await observe(ctx, local);
      return {
        ...empty(),
        taskUpdates: [
          {
            externalId: "remote-1",
            observationToken: observed.observationToken,
            groups: {
              content: { base: unknown, remote: { title: "Other", description: "Remote" } },
              workflow: { base: unknown, remote: { status: "inprogress" } },
            },
          },
        ],
      };
    });
    expect(await run(p)).toBe("idle");
    expect(value(await todu.task.get(local.id))).toEqual(local);
    expect(ack(p).taskResults[0].groups.content).toEqual({
      state: "persisted",
      value: { title: "Title", description: "Body" },
      baseline: "unproven",
      remoteWriteRequired: false,
      reason: "initialization-disagreement",
    });
  });

  it("returns the real bootstrap identity and withholds a content baseline pending approval", async () => {
    const p = provider(async () => ({
      ...empty(),
      tasks: [
        {
          externalId: "new-remote",
          title: "Imported",
          description: "Untrusted",
          status: "active",
          priority: "medium",
          labels: [],
          assignees: [],
        },
      ],
    }));
    expect(await run(p)).toBe("idle");
    const receipt = ack(p).bootstrapResults[0];
    const actual = value(await todu.task.get(receipt.localTaskId));
    expect(actual.externalId).toBe("new-remote");
    expect(actual.description).toBe("Untrusted");
    expect(receipt.groups.content).toEqual({
      state: "deferred",
      reason: "pending-content-approval",
    });
    expect(receipt.groups.workflow).toMatchObject({
      state: "persisted",
      baseline: "mirrored",
      value: { status: "active" },
    });
    value(await todu.approval.approveTaskDescription(actual.id));
    const next = provider(async (_b, _p, ctx) => {
      const observation = await observe(ctx, actual);
      return {
        ...empty(),
        taskUpdates: [
          {
            externalId: "new-remote",
            observationToken: observation.observationToken,
            groups: {
              content: { base: unknown, remote: { title: "Imported", description: "Untrusted" } },
            },
          },
        ],
      };
    });
    expect(await run(next)).toBe("idle");
    expect(ack(next).taskResults[0].groups.content).toMatchObject({
      state: "persisted",
      baseline: "mirrored",
    });
    expect(value(await todu.task.list({ projectId: project.id }))).toHaveLength(1);
  });

  it("reports a skipped old bootstrap's persisted values instead of claiming the requested body won", async () => {
    const local = await task({ updatedAt: "2026-06-01T00:00:00.000Z" });
    const p = provider(async () => ({
      ...empty(),
      tasks: [
        {
          externalId: "remote-1",
          title: "Old",
          description: "Old body",
          status: "active",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    }));
    expect(await run(p)).toBe("idle");
    expect(value(await todu.task.get(local.id))).toEqual(local);
    expect(ack(p).bootstrapResults[0]).toMatchObject({
      localTaskId: local.id,
      groups: {
        content: {
          state: "persisted",
          value: { title: "Title", description: "Body" },
          baseline: "unproven",
          reason: "initialization-disagreement",
        },
      },
    });
  });

  it("defers incomplete local assignment mapping while applying a known workflow update", async () => {
    const actor = value(
      await todu.actor.create({ id: createActorId("actor-unmapped"), displayName: "Unmapped" }),
    );
    value(await todu.project.addAuthorizedActors(project.id, [actor.id]));
    const local = await task({ assigneeActorIds: [actor.id] });
    const p = provider(async (_b, _p, ctx) => {
      const observed = await observe(ctx, local);
      expect(observed.groups.assignment.state).toBe("deferred");
      return {
        ...empty(),
        taskUpdates: [
          {
            externalId: "remote-1",
            observationToken: observed.observationToken,
            groups: {
              assignment: { base: unknown, remote: { assignees: [] } },
              workflow: {
                base: { state: "known", value: { status: "active" } },
                remote: { status: "inprogress" },
              },
            },
          },
        ],
      };
    });
    expect(await run(p)).toBe("idle");
    const actual = value(await todu.task.get(local.id));
    expect(actual.assigneeActorIds).toEqual([actor.id]);
    expect(actual.status).toBe("inprogress");
    expect(ack(p).taskResults[0].groups.assignment).toEqual({
      state: "deferred",
      reason: "incomplete-assignment-mapping",
    });
  });

  it.each([
    "invented",
    "stale",
    "same-clock",
  ])("rejects %s observation receipts without acknowledging", async (kind) => {
    const local = await task();
    const p = provider(async (_b, _p, ctx) => {
      const observed = await observe(ctx, local);
      if (kind !== "invented")
        value(
          await todu.task.update(local.id, {
            title: "Local edit",
            ...(kind === "same-clock" ? { updatedAt: local.updatedAt } : {}),
          }),
        );
      return {
        ...empty(),
        taskUpdates: [
          {
            externalId: "remote-1",
            observationToken: kind === "invented" ? "forged" : observed.observationToken,
            groups: { workflow: { base: unknown, remote: { status: "active" } } },
          },
        ],
      };
    });
    expect(await run(p)).toBe("error");
    expect(p.acknowledgePull).not.toHaveBeenCalled();
    expect(p.push).not.toHaveBeenCalled();
  });

  it("keeps independent mixed winners and never calls a local winner a mirrored baseline", async () => {
    const local = await task({ title: "Local edit", updatedAt: "2026-06-01T00:00:00.000Z" });
    binding = value(await todu.integration.update(binding.id, { strategy: "bidirectional" }));
    const p = provider(async (_b, _p, ctx) => {
      const observed = await observe(ctx, local);
      return {
        ...empty(),
        taskUpdates: [
          {
            externalId: "remote-1",
            observationToken: observed.observationToken,
            groups: {
              content: {
                base: { state: "known", value: { title: "Old", description: "Body" } },
                remote: { title: "Remote edit", description: "Body" },
                sourceTimestamp: "2026-04-01T00:00:00.000Z",
              },
              workflow: {
                base: { state: "known", value: { status: "active" } },
                remote: { status: "inprogress" },
              },
            },
          },
        ],
      };
    });
    expect(await run(p)).toBe("idle");
    expect(ack(p).taskResults[0].groups).toMatchObject({
      content: {
        state: "persisted",
        value: { title: "Local edit", description: "Body" },
        baseline: "unproven",
        remoteWriteRequired: true,
      },
      workflow: { state: "persisted", value: { status: "inprogress" }, baseline: "mirrored" },
    });
    expect(p.push).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(p.push).mock.calls[0][1][0];
    expect(payload).not.toHaveProperty("assignees");
    expect(payload).toHaveProperty("groups.assignment.state", "known");
    expect(value(await todu.task.get(local.id)).updatedAt).toBe(local.updatedAt);
  });

  it("never acknowledges a failed flush and safely replays against persisted values after restart", async () => {
    const local = await task();
    const batchFile = path.join(directory, "pending.json");
    fs.writeFileSync(batchFile, JSON.stringify({ cursor: 0, pending: "original-batch" }));
    const p = provider(async (_b, _p, ctx) => {
      const observed = await observe(ctx, local);
      return {
        ...empty(),
        taskUpdates: [
          {
            externalId: "remote-1",
            observationToken: observed.observationToken,
            groups: {
              workflow: {
                base: { state: "known", value: { status: "active" } },
                remote: { status: "inprogress" },
              },
            },
          },
        ],
      };
    });
    p.acknowledgePull = vi.fn(async () => {
      fs.writeFileSync(batchFile, JSON.stringify({ cursor: 42, pending: null }));
    });
    const flush = vi
      .spyOn(todu.__internal.syncRuntime, "flush")
      .mockRejectedValueOnce(new Error("fixture save failure"));
    expect(await run(p)).toBe("error");
    expect(p.acknowledgePull).not.toHaveBeenCalled();
    expect(JSON.parse(fs.readFileSync(batchFile, "utf8"))).toEqual({
      cursor: 0,
      pending: "original-batch",
    });
    flush.mockRestore();
    await todu.close();
    todu = (await createTodu({
      storagePath: path.join(directory, "storage"),
    })) as ToduWithInternalTools;
    // Reattach only the isolated status observer; no live runtime or configuration is involved.
    lastState = "running";
    const original = todu.integration.updateStatus;
    vi.spyOn(todu.integration, "updateStatus").mockImplementation(async (id, input) => {
      const r = await original(id, input);
      if (r.ok) lastState = r.value.state;
      return r;
    });
    expect(await run(p)).toBe("idle");
    expect(ack(p).taskResults[0].groups.workflow).toMatchObject({
      baseline: "mirrored",
      value: { status: "inprogress" },
    });
    expect(JSON.parse(fs.readFileSync(batchFile, "utf8"))).toEqual({ cursor: 42, pending: null });
    expect(value(await todu.task.list({ projectId: project.id }))).toHaveLength(1);
  });

  it("rejects a same-clock edit during flush instead of certifying a stale common baseline", async () => {
    const local = await task();
    const p = provider(async (_b, _p, ctx) => {
      const observed = await observe(ctx, local);
      return {
        ...empty(),
        taskUpdates: [
          {
            externalId: "remote-1",
            observationToken: observed.observationToken,
            groups: { content: { base: unknown, remote: { title: "Title", description: "Body" } } },
          },
        ],
      };
    });
    const original = todu.__internal.syncRuntime.flush;
    vi.spyOn(todu.__internal.syncRuntime, "flush").mockImplementationOnce(async () => {
      await original();
      value(
        await todu.task.update(local.id, {
          description: "Concurrent body",
          updatedAt: local.updatedAt,
        }),
      );
      await original();
    });
    expect(await run(p)).toBe("error");
    expect(p.acknowledgePull).not.toHaveBeenCalled();
    expect(value(await todu.task.get(local.id)).description).toBe("Concurrent body");
  });

  it.each([
    "legacy-pending",
    "unknown",
  ])("blocks all v7 application and push when durable recovery state is %s", async (state) => {
    binding = value(await todu.integration.update(binding.id, { strategy: "bidirectional" }));
    const p = provider(async () => empty());
    p.recoveryState = vi.fn(async () =>
      state === "legacy-pending"
        ? { state: "legacy-pending", batchIds: ["original-v4"] }
        : { state: "unknown", reason: "Unreadable pending file" },
    );
    expect(await run(p)).toBe("blocked");
    expect(p.pull).not.toHaveBeenCalled();
    expect(p.push).not.toHaveBeenCalled();
    expect(p.acknowledgePull).not.toHaveBeenCalled();
  });

  it("treats an absent stored detail as canonical empty content, not an unknown assignment", async () => {
    const p = provider(async () => ({
      ...empty(),
      tasks: [
        {
          externalId: "empty-body",
          title: "Empty",
          description: "",
          status: "active",
          priority: "medium",
          labels: [],
          assignees: [],
        },
      ],
    }));
    expect(await run(p)).toBe("idle");
    expect(ack(p).bootstrapResults[0].groups.content).toMatchObject({
      state: "persisted",
      value: { title: "Empty", description: "" },
      baseline: "mirrored",
    });
  });

  it("retains incomplete bootstrap assignments as deferred rather than certifying an empty remote set", async () => {
    const p = provider(async () => ({
      ...empty(),
      tasks: [
        {
          externalId: "new-assignment",
          title: "Imported",
          assignees: [{ externalAccountId: "unknown-account" }],
        },
      ],
    }));
    expect(await run(p)).toBe("idle");
    const receipt = ack(p).bootstrapResults[0];
    expect(receipt.groups.assignment).toEqual({
      state: "deferred",
      reason: "incomplete-assignment-mapping",
    });
    expect(value(await todu.task.get(receipt.localTaskId)).assigneeActorIds).toEqual([]);
    expect(value(await todu.project.get(project.id)).authorizedAssigneeActorIds).toEqual(
      project.authorizedAssigneeActorIds,
    );
  });

  it("does not expose unrelated-project groups or accept their identity with a bound token", async () => {
    const local = await task();
    const otherProject = value(await todu.project.create({ name: "Other project" }));
    const other = value(
      await todu.task.create({
        projectId: otherProject.id,
        title: "Other",
        externalId: "other-remote",
      }),
    );
    const p = provider(async (_b, _p, ctx) => {
      expect(
        await ctx.observeTaskGroups({ localTaskId: other.id, externalId: "other-remote" }),
      ).toEqual({ state: "missing" });
      const observation = await observe(ctx, local);
      return {
        ...empty(),
        taskUpdates: [
          {
            externalId: "other-remote",
            observationToken: observation.observationToken,
            groups: { workflow: { base: unknown, remote: { status: "canceled" } } },
          },
        ],
      };
    });
    expect(await run(p)).toBe("error");
    expect(p.acknowledgePull).not.toHaveBeenCalled();
    expect(value(await todu.task.get(other.id)).status).toBe("active");
  });

  it("does not resume ambiguous partial content after a failed guarded application", async () => {
    const local = await task();
    const p = provider(async (_b, _p, ctx) => {
      const observation = await observe(ctx, local);
      return {
        ...empty(),
        taskUpdates: [
          {
            externalId: "remote-1",
            observationToken: observation.observationToken,
            groups: {
              content: {
                base: { state: "known", value: { title: "Title", description: "Body" } },
                remote: { title: "Remote title", description: "Remote body" },
              },
            },
          },
        ],
      };
    });
    const original = todu.__internal.syncRuntime.tasks.updateIfCurrent;
    vi.spyOn(todu.__internal.syncRuntime.tasks, "updateIfCurrent").mockImplementationOnce(
      async (input) => {
        value(
          await todu.task.update(local.id, { title: "Remote title", updatedAt: local.updatedAt }),
        );
        return original(input);
      },
    );
    expect(await run(p)).toBe("error");
    expect(p.acknowledgePull).not.toHaveBeenCalled();
    expect(await run(p)).toBe("error");
    expect(p.acknowledgePull).not.toHaveBeenCalled();
    expect(value(await todu.task.get(local.id))).toMatchObject({
      title: "Remote title",
      description: "Body",
      updatedAt: local.updatedAt,
    });
    expect(value(await todu.__internal.syncRuntime.contentRecovery.read(binding.id))).toHaveLength(
      1,
    );
  });

  it.each(["disabled", "none"])("does no v7 provider work for %s bindings", async (kind) => {
    value(
      await todu.integration.update(
        binding.id,
        kind === "disabled" ? { enabled: false } : { strategy: "none" },
      ),
    );
    const p = provider(async () => empty());
    const scheduled: (() => void)[] = [];
    const handle = createSyncPluginWorkerRuntime({
      pluginName: "fixture",
      pluginVersion: "1.0.0",
      modulePath: "/fixture",
      authorityId: "fixture",
      provider: p,
      providerApiVersion: 7,
      getTodu: () => todu,
      logger: createDaemonLogger({ level: "error" }),
      config: {
        enabled: true,
        settings: {},
        intervalMs: 60000,
        retryInitialMs: 60000,
        retryMaxMs: 60000,
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
      await handle.stop();
    }
    expect(p.initialize).not.toHaveBeenCalled();
    expect(p.recoveryState).not.toHaveBeenCalled();
    expect(p.pull).not.toHaveBeenCalled();
    expect(p.acknowledgePull).not.toHaveBeenCalled();
    expect(p.push).not.toHaveBeenCalled();
  });

  it.each([
    { strategy: "push", change: "relink" },
    { strategy: "bidirectional", change: "relink" },
    { strategy: "push", change: "same-clock-body" },
    { strategy: "bidirectional", change: "same-clock-body" },
    { strategy: "push", change: "comment" },
    { strategy: "bidirectional", change: "comment" },
    { strategy: "push", change: "disable" },
    { strategy: "bidirectional", change: "disable" },
  ] as const)("rejects $strategy exports changed by $change before push invocation", async ({
    strategy,
    change,
  }) => {
    const local = await task({ sourceUrl: "https://fixture.test/issues/1" });
    const note = value(
      await todu.note.create({
        entityType: "task",
        entityId: local.id,
        content: "Original comment",
      }),
    );
    binding = value(await todu.integration.update(binding.id, { strategy }));
    const p = provider(async () => empty());
    vi.mocked(p.recoveryState)
      .mockImplementationOnce(async () => ({ state: "ready" }))
      .mockImplementationOnce(async () => {
        if (change === "relink")
          value(
            await todu.task.update(local.id, {
              externalId: "remote-2",
              sourceUrl: "https://fixture.test/issues/2",
              title: "Relinked title",
              description: "Relinked body",
            }),
          );
        else if (change === "same-clock-body")
          value(
            await todu.task.update(local.id, {
              description: "Concurrent body",
              updatedAt: local.updatedAt,
            }),
          );
        else if (change === "comment")
          value(
            await todu.note.update(note.id, {
              content: "Concurrent comment",
              updatedAt: note.updatedAt,
            }),
          );
        else value(await todu.integration.update(binding.id, { enabled: false }));
        return { state: "ready" };
      });
    expect(await run(p)).toBe("error");
    expect(p.push).not.toHaveBeenCalled();
    if (strategy === "bidirectional") expect(p.acknowledgePull).toHaveBeenCalledOnce();
    if (change === "relink")
      expect(value(await todu.task.get(local.id))).toMatchObject({
        externalId: "remote-2",
        sourceUrl: "https://fixture.test/issues/2",
        title: "Relinked title",
        description: "Relinked body",
      });
    else if (change === "same-clock-body")
      expect(value(await todu.task.get(local.id))).toMatchObject({
        externalId: "remote-1",
        description: "Concurrent body",
        updatedAt: local.updatedAt,
      });
    else if (change === "comment")
      expect(
        value(await todu.note.list({ entityType: "task", entityId: local.id })).find(
          (row) => row.id === note.id,
        )?.content,
      ).toBe("Concurrent comment");
    else expect(value(await todu.integration.get(binding.id)).enabled).toBe(false);
  });

  it("exports stable linked and unlinked v7 values with identity and clock from their same snapshots", async () => {
    const local = await task({ sourceUrl: "https://fixture.test/issues/1" });
    const unlinked = value(
      await todu.task.create({
        projectId: project.id,
        title: "New local",
        description: "Unlinked body",
      }),
    );
    binding = value(await todu.integration.update(binding.id, { strategy: "push" }));
    const p = provider(async () => empty());
    expect(await run(p)).toBe("idle");
    const payloads = vi.mocked(p.push).mock.calls[0][1];
    expect(payloads.find((row) => row.localTaskId === local.id)).toMatchObject({
      localTaskId: local.id,
      externalId: "remote-1",
      sourceUrl: local.sourceUrl,
      updatedAt: local.updatedAt,
      groups: {
        content: { state: "known", value: { title: local.title, description: local.description } },
      },
    });
    const exported = payloads.find((row) => row.localTaskId === unlinked.id);
    expect(exported).toMatchObject({
      localTaskId: unlinked.id,
      updatedAt: unlinked.updatedAt,
      groups: {
        content: { state: "known", value: { title: "New local", description: "Unlinked body" } },
        assignment: { state: "known", value: { assignees: [] } },
      },
    });
    expect(exported?.externalId).toBeUndefined();
  });

  it("push-only exports deferred assignment, without fake pull receipts or truncated assignees", async () => {
    const actor = value(
      await todu.actor.create({
        id: createActorId("actor-push-unmapped"),
        displayName: "Unmapped",
      }),
    );
    value(await todu.project.addAuthorizedActors(project.id, [actor.id]));
    await task({ assigneeActorIds: [actor.id] });
    binding = value(await todu.integration.update(binding.id, { strategy: "push" }));
    const p = provider(async () => empty());
    expect(await run(p)).toBe("idle");
    expect(p.pull).not.toHaveBeenCalled();
    expect(p.acknowledgePull).not.toHaveBeenCalled();
    const exported = vi.mocked(p.push).mock.calls[0][1][0];
    expect(exported).not.toHaveProperty("assignees");
    expect(exported.groups.assignment).toEqual({
      state: "deferred",
      reason: "incomplete-assignment-mapping",
    });
  });
});
