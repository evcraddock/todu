import {
  createIntegrationBindingId,
  createProjectId,
  createTaskId,
  err,
  type IntegrationBinding,
  ok,
  type SyncProviderPullResultV6,
  type Task,
} from "@todu/core";
import type { Todu } from "@todu/engine";
import { describe, expect, it, vi } from "vitest";
import { createLocalTaskPullGuard } from "./sync-local-task-context.js";

const binding: IntegrationBinding = {
  id: createIntegrationBindingId("binding-test"),
  provider: "test",
  projectId: createProjectId("project-test"),
  targetKind: "repository",
  targetRef: "owner/repo",
  enabled: true,
  strategy: "pull",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};
function task(input: Partial<Task> = {}): Task {
  return {
    id: createTaskId("task-test"),
    projectId: binding.projectId,
    title: "Private title",
    status: "canceled",
    priority: "medium",
    labels: [],
    assigneeActorIds: [],
    assignees: [],
    externalId: "owner/repo#8",
    sourceUrl: "https://tracker.test/owner/repo/issues/8",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
    ...input,
  };
}
function fixture(tasks: Task[] = [task()]) {
  const list = vi.fn().mockResolvedValue(ok(tasks));
  const get = vi.fn().mockResolvedValue(ok(binding));
  const withCurrentLifecycle = vi.fn(async ({ run }: { run: () => Promise<void> }) => {
    await run();
    return ok(undefined);
  });
  const todu = {
    task: { list },
    integration: { get },
    __internal: { syncRuntime: { withCurrentTaskLifecycle: withCurrentLifecycle } },
  } as unknown as Todu;
  const isCurrentHost = vi.fn().mockReturnValue(true);
  return {
    list,
    get,
    isCurrentHost,
    create: () => createLocalTaskPullGuard({ todu, binding, isCurrentHost }),
  };
}
function pull(token?: string): SyncProviderPullResultV6 {
  return {
    tasks: [],
    taskUpdates: [],
    checkpoint: "pending",
    cancelledTaskExclusions: token ? [{ observationToken: token }] : [],
  };
}

describe("scoped local task pull context", () => {
  it("exposes only immutable identity/lifecycle data scoped to the binding", async () => {
    const f = fixture();
    const guard = await f.create();
    const result = guard.context.resolveTask({ externalId: "owner/repo#8" });
    expect(result.state).toBe("found");
    if (result.state !== "found") throw new Error("Expected task");
    expect(Object.keys(result.task).sort()).toEqual(
      [
        "externalId",
        "localTaskId",
        "observationToken",
        "projectId",
        "sourceUrl",
        "status",
        "updatedAt",
      ].sort(),
    );
    expect(Object.isFrozen(guard.context)).toBe(true);
    expect(Object.isFrozen(result.task)).toBe(true);
    expect(f.list).toHaveBeenCalledWith({ projectId: binding.projectId });
    expect(
      guard.context.resolveTask({ localTaskId: createTaskId("another-project-task") }),
    ).toEqual({ state: "missing" });
    guard.expire();
    expect(guard.context.resolveTask({ externalId: "owner/repo#8" })).toEqual({
      state: "unknown",
      reason: "context-expired",
    });
  });

  it("does not let mutable returned engine objects refresh an old snapshot", async () => {
    const original = task();
    const guard = await fixture([original]).create();
    original.status = "active";
    expect(guard.context.resolveTask({ externalId: original.externalId })).toMatchObject({
      state: "found",
      task: { status: "canceled" },
    });
  });

  it.each([
    {},
    { externalId: "" },
    { externalId: " " },
    { localTaskId: 42 },
    { projectId: "other" },
  ])("rejects malformed selectors %j", async (query) => {
    const guard = await fixture().create();
    expect(guard.context.resolveTask(query as never)).toEqual({
      state: "unknown",
      reason: "invalid-query",
    });
  });

  it("requires every selector and durable identity to agree", async () => {
    const guard = await fixture().create();
    expect(guard.context.resolveTask({ localTaskId: task().id, externalId: "wrong" })).toEqual({
      state: "unknown",
      reason: "identity-mismatch",
    });
    expect(guard.context.resolveTask({ sourceUrl: task().sourceUrl })).toMatchObject({
      state: "found",
    });
    expect(guard.context.resolveTask({ externalId: "absent" })).toEqual({ state: "missing" });
  });

  it.each(["externalId", "sourceUrl"] as const)(
    "rejects duplicate %s even when a local ID disambiguates",
    async (field) => {
      const other = task({
        id: createTaskId("duplicate"),
        externalId: "different",
        sourceUrl: "https://different.test",
      });
      other[field] = task()[field];
      const guard = await fixture([task(), other]).create();
      expect(guard.context.resolveTask({ localTaskId: task().id })).toEqual({ state: "ambiguous" });
    },
  );

  it("fails context creation on read failure or unexpected project exposure", async () => {
    const f = fixture();
    f.list.mockResolvedValueOnce(
      err({ type: "validation", field: "test", message: "unavailable" }),
    );
    await expect(f.create()).rejects.toThrow("context unavailable");
    f.list.mockResolvedValueOnce(ok([task({ projectId: createProjectId("other") })]));
    await expect(f.create()).rejects.toThrow("scope mismatch");
  });

  it.each(["active", "done", "inprogress", "waiting"] as const)(
    "does not authorize exclusion of %s tasks",
    async (status) => {
      const guard = await fixture([task({ status })]).create();
      const resolution = guard.context.resolveTask({ localTaskId: task().id });
      if (resolution.state !== "found") throw new Error("Expected task");
      expect(() => guard.validate(pull(resolution.task.observationToken))).toThrow(
        "invalid cancellation exclusion",
      );
    },
  );

  it("rejects fabricated, foreign-cycle, duplicate, or missing exclusion receipts", async () => {
    const f = fixture();
    const first = await f.create();
    const resolution = first.context.resolveTask({ localTaskId: task().id });
    if (resolution.state !== "found") throw new Error("Expected task");
    const token = resolution.task.observationToken;
    expect(() => first.validate(pull("invented"))).toThrow("invalid cancellation exclusion");
    expect(() =>
      first.validate({ ...pull(), cancelledTaskExclusions: undefined } as never),
    ).toThrow("requires cancelledTaskExclusions");
    expect(() =>
      first.validate({
        ...pull(token),
        cancelledTaskExclusions: [{ observationToken: token }, { observationToken: token }],
      }),
    ).toThrow("duplicate");
    const next = await f.create();
    expect(() => next.validate(pull(token))).toThrow("invalid cancellation exclusion");
  });

  it.each([
    "tasks",
    "taskUpdates",
    "comments",
    "deletedComments",
    "completeCommentExternalTaskIds",
  ])("rejects exclusions overlapping %s", async (field) => {
    const guard = await fixture().create();
    const resolution = guard.context.resolveTask({ localTaskId: task().id });
    if (resolution.state !== "found") throw new Error("Expected task");
    const payload = pull(resolution.task.observationToken);
    Object.assign(payload, {
      [field]:
        field === "completeCommentExternalTaskIds"
          ? [task().externalId]
          : [{ externalId: task().externalId, externalTaskId: task().externalId }],
    });
    expect(() => guard.validate(payload)).toThrow("conflicts with returned");
  });

  it.each([
    "status",
    "updatedAt",
    "externalId",
    "sourceUrl",
    "duplicate",
    "missing",
    "binding",
    "host",
  ])("rejects changed %s at the application/ack boundary", async (change) => {
    const f = fixture();
    const guard = await f.create();
    const resolution = guard.context.resolveTask({ localTaskId: task().id });
    if (resolution.state !== "found") throw new Error("Expected task");
    const changed = task();
    if (change === "status") changed.status = "active";
    if (change === "updatedAt") changed.updatedAt = "2026-01-03T00:00:00Z";
    if (change === "externalId") changed.externalId = "new";
    if (change === "sourceUrl") changed.sourceUrl = "https://new.test";
    f.list.mockResolvedValue(
      ok(
        change === "missing"
          ? []
          : change === "duplicate"
            ? [changed, task({ id: createTaskId("duplicate") })]
            : [changed],
      ),
    );
    if (change === "binding") f.get.mockResolvedValue(ok({ ...binding, targetRef: "other/repo" }));
    if (change === "host") f.isCurrentHost.mockReturnValue(false);
    const action = vi.fn().mockResolvedValue(undefined);
    await expect(
      guard.verifyAndRun(pull(resolution.task.observationToken), action),
    ).rejects.toThrow();
    expect(action).not.toHaveBeenCalled();
  });

  it("accepts verified cancellation receipts and invokes the callback at the checked boundary", async () => {
    const f = fixture();
    const guard = await f.create();
    const result = guard.context.resolveTask({ localTaskId: task().id });
    if (result.state !== "found") throw new Error("Expected task");
    const action = vi.fn().mockResolvedValue("acknowledged");
    guard.expire();
    expect(await guard.verifyAndRun(pull(result.task.observationToken), action)).toBe(
      "acknowledged",
    );
    expect(action).toHaveBeenCalledExactlyOnceWith();
  });
});
