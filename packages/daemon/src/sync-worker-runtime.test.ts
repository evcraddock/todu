import {
  type Actor,
  type CommentSyncProvenance,
  createActorId,
  createCommentSyncProvenanceId,
  createIntegrationBindingId,
  createNoteId,
  createProjectId,
  createTaskId,
  err,
  type ImportedCommentInput,
  type ImportedContentApproval,
  type ImportedTaskInput,
  type IntegrationBinding,
  type IntegrationBindingStatus,
  type Note,
  ok,
  type Project,
  type SyncProvider,
  type SyncProviderV3,
  type SyncProviderV4,
  type SyncProviderV5,
  type SyncTaskFieldGroupUpdate,
  type Task,
  type TaskWithDetail,
  validationError,
} from "@todu/core";
import { createSyncContentRecoveryStore, type ToduWithInternalTools } from "@todu/engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DaemonLogger } from "./logger.js";
import {
  computeRetryDelayMs,
  createSyncPluginWorkerRuntime,
  resolveSyncPluginExecutionConfig,
} from "./sync-worker-runtime.js";

describe("sync-worker-runtime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("executes cycles for enabled matching integration bindings and updates status", async () => {
    const provider = createProvider();
    const project = createProject();
    const task = createTask(project.id);
    const binding = createBinding(project.id, {
      id: "ibind-1",
      provider: "github",
      strategy: "bidirectional",
      enabled: true,
    });
    const otherProviderBinding = createBinding(project.id, {
      id: "ibind-2",
      provider: "forgejo",
      strategy: "bidirectional",
      enabled: true,
    });
    const disabledBinding = createBinding(project.id, {
      id: "ibind-3",
      provider: "github",
      strategy: "bidirectional",
      enabled: false,
    });
    const todu = createTodu(project, [task], [binding, otherProviderBinding, disabledBinding]);

    const runtime = createSyncPluginWorkerRuntime({
      pluginName: "github",
      pluginVersion: "1.0.0",
      modulePath: "/plugins/github.js",
      authorityId: "daemon://authority-1",
      provider,
      config: {
        enabled: true,
        intervalMs: 1_000,
        retryInitialMs: 100,
        retryMaxMs: 800,
        settings: {},
      },
      logger: createLogger(),
      getTodu: () => todu.instance,
    });

    const handle = runtime.start();

    await vi.advanceTimersByTimeAsync(0);

    expect(todu.integration.list).toHaveBeenCalledWith({
      provider: "github",
      enabled: true,
    });
    expect(provider.initialize).toHaveBeenCalledTimes(1);
    expect(provider.initialize).toHaveBeenCalledWith({
      settings: {},
    });
    expect(provider.pull).toHaveBeenCalledTimes(1);
    expect(provider.pull).toHaveBeenCalledWith(binding, project);
    expect(provider.push).toHaveBeenCalledTimes(1);
    expect(provider.push).toHaveBeenCalledWith(
      binding,
      [
        {
          localTaskId: task.id,
          externalId: task.externalId,
          title: task.title,
          description: undefined,
          status: task.status,
          priority: task.priority,
          labels: task.labels,
          assignees: [],
          sourceUrl: task.sourceUrl,
          updatedAt: task.updatedAt,
          comments: [],
        },
      ],
      project,
    );
    expect(todu.integration.updateStatus).toHaveBeenCalledTimes(2);
    expect(todu.integration.updateStatus).toHaveBeenNthCalledWith(1, binding.id, {
      authorityId: "daemon://authority-1",
      state: "running",
      lastAttemptedSyncAt: expect.any(String),
      lastSuccessfulSyncAt: undefined,
      lastErrorSummary: null,
    });
    expect(todu.integration.updateStatus).toHaveBeenNthCalledWith(2, binding.id, {
      authorityId: "daemon://authority-1",
      state: "idle",
      lastAttemptedSyncAt: expect.any(String),
      lastSuccessfulSyncAt: expect.any(String),
      lastErrorSummary: null,
    });

    handle.stop();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(provider.shutdown).toHaveBeenCalledTimes(1);
  });

  it("passes binding options through to providers on the first sync cycle", async () => {
    const provider = createProvider();
    const project = createProject();
    const binding = createBinding(project.id, {
      options: {
        importClosedOnBootstrap: true,
      },
    });
    const todu = createTodu(project, [], [binding]);

    const runtime = createSyncPluginWorkerRuntime({
      pluginName: "github",
      pluginVersion: "1.0.0",
      modulePath: "/plugins/github.js",
      authorityId: "daemon://authority-1",
      provider,
      config: {
        enabled: true,
        intervalMs: 1_000,
        retryInitialMs: 100,
        retryMaxMs: 800,
        settings: {},
      },
      logger: createLogger(),
      getTodu: () => todu.instance,
    });

    const handle = runtime.start();

    await vi.advanceTimersByTimeAsync(0);

    expect(provider.pull).toHaveBeenCalledWith(
      expect.objectContaining({
        id: binding.id,
        options: {
          importClosedOnBootstrap: true,
        },
      }),
      project,
    );

    handle.stop();
    await vi.advanceTimersByTimeAsync(10_000);
  });

  it("retries failed cycles with exponential backoff and writes error status", async () => {
    const provider = createProvider({
      pull: vi
        .fn<SyncProvider["pull"]>()
        .mockRejectedValueOnce(new Error("network down"))
        .mockRejectedValueOnce(new Error("network down"))
        .mockResolvedValue({ tasks: [] }),
    });
    const project = createProject();
    const binding = createBinding(project.id, {
      strategy: "pull",
    });
    const todu = createTodu(project, [], [binding]);

    const runtime = createSyncPluginWorkerRuntime({
      pluginName: "github",
      pluginVersion: "1.0.0",
      modulePath: "/plugins/github.js",
      authorityId: "daemon://authority-1",
      provider,
      config: {
        enabled: true,
        intervalMs: 1_000,
        retryInitialMs: 100,
        retryMaxMs: 400,
        settings: {},
      },
      logger: createLogger(),
      getTodu: () => todu.instance,
    });

    const handle = runtime.start();

    await vi.advanceTimersByTimeAsync(0);
    expect(provider.pull).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(99);
    expect(provider.pull).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(provider.pull).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(199);
    expect(provider.pull).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1);
    expect(provider.pull).toHaveBeenCalledTimes(3);

    const statusTransitions = todu.integration.updateStatus.mock.calls
      .map((call) => call[1]?.state)
      .filter((value) => value !== undefined);

    expect(statusTransitions).toEqual(["running", "error", "running", "error", "running", "idle"]);
    expect(provider.initialize).toHaveBeenCalledTimes(1);

    handle.stop();
  });

  it("stops without orphaning scheduled loops and shuts down provider", async () => {
    const deferred = createDeferred<void>();
    const provider = createProvider({
      pull: vi.fn<SyncProvider["pull"]>().mockImplementation(async () => {
        await deferred.promise;
        return { tasks: [] };
      }),
    });
    const project = createProject();
    const binding = createBinding(project.id, {
      strategy: "pull",
    });
    const todu = createTodu(project, [], [binding]);

    const runtime = createSyncPluginWorkerRuntime({
      pluginName: "github",
      pluginVersion: "1.0.0",
      modulePath: "/plugins/github.js",
      authorityId: "daemon://authority-1",
      provider,
      config: {
        enabled: true,
        intervalMs: 1_000,
        retryInitialMs: 100,
        retryMaxMs: 400,
        settings: {},
      },
      logger: createLogger(),
      getTodu: () => todu.instance,
    });

    const handle = runtime.start();

    await vi.advanceTimersByTimeAsync(0);
    expect(provider.pull).toHaveBeenCalledTimes(1);

    handle.stop();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(provider.pull).toHaveBeenCalledTimes(1);

    deferred.resolve();
    await vi.runAllTimersAsync();
    await Promise.resolve();

    expect(provider.shutdown).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(provider.pull).toHaveBeenCalledTimes(1);
  });

  it("resolves config defaults and ignores deprecated projectId and strategy settings", () => {
    const resolved = resolveSyncPluginExecutionConfig("github", {
      retryInitialSeconds: 12,
      retryMaxSeconds: 5,
      strategy: "pull",
      projectId: "proj-1",
      enabled: "yes",
      intervalSeconds: -1,
      settings: "oops",
    });

    expect(resolved.config).toEqual({
      enabled: true,
      intervalMs: 300_000,
      retryInitialMs: 12_000,
      retryMaxMs: 12_000,
      settings: {},
    });
    expect(resolved.warnings).toEqual(
      expect.arrayContaining([
        "sync plugin config warning (github): enabled must be boolean; using true",
        "sync plugin config warning (github): intervalSeconds must be a positive number; using 300",
        "sync plugin config warning (github): retryMaxSeconds is less than retryInitialSeconds; using retryInitialSeconds value",
        "sync plugin config warning (github): projectId is ignored; shared integration bindings define project linkage",
        "sync plugin config warning (github): strategy is ignored; shared integration bindings define sync strategy",
        "sync plugin config warning (github): settings must be an object; using empty settings",
      ]),
    );
    expect(computeRetryDelayMs(0, resolved.config)).toBe(12_000);
    expect(computeRetryDelayMs(3, resolved.config)).toBe(12_000);
  });

  it("push includes task comments from note.list in each exported task payload", async () => {
    const provider = createProvider();
    const project = createProject();
    const task = createTask(project.id, { externalId: "gh-task-1" });
    const binding = createBinding(project.id, { strategy: "push" });
    const taskNote = createNote({
      entityType: "task",
      entityId: task.id,
      content: "a comment",
      tags: ["sync:externalId:ext-c1"],
    });
    const todu = createTodu(project, [task], [binding], { notes: [taskNote] });

    const runtime = createSyncPluginWorkerRuntime({
      pluginName: "github",
      pluginVersion: "1.0.0",
      modulePath: "/plugins/github.js",
      authorityId: "daemon://authority-1",
      provider,
      config: {
        enabled: true,
        intervalMs: 1_000,
        retryInitialMs: 100,
        retryMaxMs: 800,
        settings: {},
      },
      logger: createLogger(),
      getTodu: () => todu.instance,
    });

    const handle = runtime.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(provider.push).toHaveBeenCalledTimes(1);
    const pushArgs = provider.push.mock.calls[0];
    const pushedTasks = pushArgs[1];
    expect(pushedTasks).toHaveLength(1);
    expect(pushedTasks[0].comments).toEqual([
      expect.objectContaining({
        localNoteId: taskNote.id,
        body: taskNote.content,
        createdAt: taskNote.createdAt,
        externalId: "ext-c1",
        provenance: expect.objectContaining({
          bindingId: binding.id,
          localNoteId: taskNote.id,
          externalTaskId: task.externalId,
          externalCommentId: "ext-c1",
        }),
      }),
    ]);

    handle.stop();
  });

  it("push applies returned task links to existing local tasks", async () => {
    const project = createProject();
    const task = createTask(project.id);
    const binding = createBinding(project.id, { strategy: "push" });
    const provider = createProvider({
      push: vi.fn<SyncProvider["push"]>().mockResolvedValue({
        commentLinks: [],
        taskLinks: [
          {
            localTaskId: task.id,
            externalId: "gh-101",
            sourceUrl: "https://example.com/issues/101",
          },
        ],
      }),
    });
    const todu = createTodu(project, [task], [binding]);

    const runtime = createSyncPluginWorkerRuntime({
      pluginName: "github",
      pluginVersion: "1.0.0",
      modulePath: "/plugins/github.js",
      authorityId: "daemon://authority-1",
      provider,
      config: {
        enabled: true,
        intervalMs: 1_000,
        retryInitialMs: 100,
        retryMaxMs: 800,
        settings: {},
      },
      logger: createLogger(),
      getTodu: () => todu.instance,
    });

    const handle = runtime.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(todu.task.update).toHaveBeenCalledTimes(1);
    expect(todu.task.update).toHaveBeenCalledWith(task.id, {
      externalId: "gh-101",
      sourceUrl: "https://example.com/issues/101",
    });

    handle.stop();
  });

  it("push applies returned task links idempotently across cycles", async () => {
    const project = createProject();
    const task = createTask(project.id);
    const binding = createBinding(project.id, { strategy: "push" });
    const provider = createProvider({
      push: vi.fn<SyncProvider["push"]>().mockResolvedValue({
        commentLinks: [],
        taskLinks: [
          {
            localTaskId: task.id,
            externalId: "gh-101",
            sourceUrl: "https://example.com/issues/101",
          },
        ],
      }),
    });
    const todu = createTodu(project, [task], [binding]);

    const runtime = createSyncPluginWorkerRuntime({
      pluginName: "github",
      pluginVersion: "1.0.0",
      modulePath: "/plugins/github.js",
      authorityId: "daemon://authority-1",
      provider,
      config: {
        enabled: true,
        intervalMs: 1_000,
        retryInitialMs: 100,
        retryMaxMs: 800,
        settings: {},
      },
      logger: createLogger(),
      getTodu: () => todu.instance,
    });

    const handle = runtime.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(provider.push).toHaveBeenCalledTimes(2);
    expect(todu.task.update).toHaveBeenCalledTimes(1);

    handle.stop();
  });

  it("push task links prevent duplicate task import on later pull cycles", async () => {
    const project = createProject();
    const task = createTask(project.id);
    const binding = createBinding(project.id, { strategy: "bidirectional" });
    const provider = createProvider({
      pull: vi
        .fn<SyncProvider["pull"]>()
        .mockResolvedValueOnce({ tasks: [], comments: [] })
        .mockResolvedValue({
          tasks: [
            {
              externalId: "gh-101",
              title: task.title,
              updatedAt: new Date(0).toISOString(),
            },
          ],
          comments: [],
        }),
      push: vi
        .fn<SyncProvider["push"]>()
        .mockResolvedValueOnce({
          commentLinks: [],
          taskLinks: [
            {
              localTaskId: task.id,
              externalId: "gh-101",
              sourceUrl: "https://example.com/issues/101",
            },
          ],
        })
        .mockResolvedValue({ commentLinks: [], taskLinks: [] }),
    });
    const todu = createTodu(project, [task], [binding]);

    const runtime = createSyncPluginWorkerRuntime({
      pluginName: "github",
      pluginVersion: "1.0.0",
      modulePath: "/plugins/github.js",
      authorityId: "daemon://authority-1",
      provider,
      config: {
        enabled: true,
        intervalMs: 1_000,
        retryInitialMs: 100,
        retryMaxMs: 800,
        settings: {},
      },
      logger: createLogger(),
      getTodu: () => todu.instance,
    });

    const handle = runtime.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(todu.task.create).not.toHaveBeenCalled();
    expect(todu.task.update).toHaveBeenCalledTimes(1);
    expect(todu.task.update).toHaveBeenCalledWith(task.id, {
      externalId: "gh-101",
      sourceUrl: "https://example.com/issues/101",
    });

    handle.stop();
  });

  it("push task links fail on conflicting existing linkage", async () => {
    const project = createProject();
    const task = {
      ...createTask(project.id),
      externalId: "gh-existing",
    };
    const binding = createBinding(project.id, { strategy: "push" });
    const provider = createProvider({
      push: vi.fn<SyncProvider["push"]>().mockResolvedValue({
        commentLinks: [],
        taskLinks: [
          {
            localTaskId: task.id,
            externalId: "gh-other",
          },
        ],
      }),
    });
    const todu = createTodu(project, [task], [binding]);

    const runtime = createSyncPluginWorkerRuntime({
      pluginName: "github",
      pluginVersion: "1.0.0",
      modulePath: "/plugins/github.js",
      authorityId: "daemon://authority-1",
      provider,
      config: {
        enabled: true,
        intervalMs: 1_000,
        retryInitialMs: 100,
        retryMaxMs: 800,
        settings: {},
      },
      logger: createLogger(),
      getTodu: () => todu.instance,
    });

    const handle = runtime.start();
    await vi.advanceTimersByTimeAsync(0);

    const statusTransitions = todu.integration.updateStatus.mock.calls
      .map((call) => call[1]?.state)
      .filter((value) => value !== undefined);

    expect(statusTransitions).toEqual(["running", "error"]);
    expect(todu.task.update).not.toHaveBeenCalled();

    handle.stop();
  });

  it("push applies returned comment links to existing local notes", async () => {
    const project = createProject();
    const task = createTask(project.id);
    const binding = createBinding(project.id, { strategy: "push" });
    const localNote = createNote({
      entityType: "task",
      entityId: task.id,
      content: "local comment",
      tags: ["local"],
    });
    const provider = createProvider({
      push: vi.fn<SyncProvider["push"]>().mockResolvedValue({
        commentLinks: [
          {
            localNoteId: localNote.id,
            externalCommentId: "gh-comment-1",
            externalTaskId: task.id,
          },
        ],
        taskLinks: [],
      }),
    });
    const todu = createTodu(project, [task], [binding], { notes: [localNote] });

    const runtime = createSyncPluginWorkerRuntime({
      pluginName: "github",
      pluginVersion: "1.0.0",
      modulePath: "/plugins/github.js",
      authorityId: "daemon://authority-1",
      provider,
      config: {
        enabled: true,
        intervalMs: 1_000,
        retryInitialMs: 100,
        retryMaxMs: 800,
        settings: {},
      },
      logger: createLogger(),
      getTodu: () => todu.instance,
    });

    const handle = runtime.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(todu.note.update).toHaveBeenCalledTimes(1);
    expect(todu.note.update).toHaveBeenCalledWith(localNote.id, {
      tags: ["local", "sync:externalId:gh-comment-1"],
    });

    handle.stop();
  });

  it("push applies returned comment links idempotently across cycles", async () => {
    const project = createProject();
    const task = createTask(project.id);
    const binding = createBinding(project.id, { strategy: "push" });
    const localNote = createNote({
      entityType: "task",
      entityId: task.id,
      content: "local comment",
    });
    const provider = createProvider({
      push: vi.fn<SyncProvider["push"]>().mockResolvedValue({
        commentLinks: [
          {
            localNoteId: localNote.id,
            externalCommentId: "gh-comment-1",
            externalTaskId: task.id,
          },
        ],
        taskLinks: [],
      }),
    });
    const todu = createTodu(project, [task], [binding], { notes: [localNote] });

    const runtime = createSyncPluginWorkerRuntime({
      pluginName: "github",
      pluginVersion: "1.0.0",
      modulePath: "/plugins/github.js",
      authorityId: "daemon://authority-1",
      provider,
      config: {
        enabled: true,
        intervalMs: 1_000,
        retryInitialMs: 100,
        retryMaxMs: 800,
        settings: {},
      },
      logger: createLogger(),
      getTodu: () => todu.instance,
    });

    const handle = runtime.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(provider.push).toHaveBeenCalledTimes(2);
    expect(todu.note.update).toHaveBeenCalledTimes(1);

    handle.stop();
  });

  it("linked local-origin comments later update remotely through the same local note", async () => {
    const project = createProject();
    const task = createTask(project.id, { externalId: "gh-task-1" });
    const binding = createBinding(project.id, { strategy: "bidirectional" });
    const localNote = createNote({
      entityType: "task",
      entityId: task.id,
      content: "local comment",
    });
    const provider = createProvider({
      pull: vi
        .fn<SyncProvider["pull"]>()
        .mockResolvedValueOnce({ tasks: [], comments: [] })
        .mockResolvedValue({
          tasks: [],
          comments: [
            {
              externalId: "gh-comment-1",
              externalTaskId: task.externalId!,
              body: "remote edit",
              createdAt: "2026-03-10T10:00:00Z",
              updatedAt: "2026-03-10T11:00:00Z",
            },
          ],
        }),
      push: vi
        .fn<SyncProvider["push"]>()
        .mockResolvedValueOnce({
          commentLinks: [
            {
              localNoteId: localNote.id,
              externalCommentId: "gh-comment-1",
              externalTaskId: task.id,
            },
          ],
          taskLinks: [],
        })
        .mockResolvedValue({ commentLinks: [], taskLinks: [] }),
    });
    const todu = createTodu(project, [task], [binding], { notes: [localNote] });

    const runtime = createSyncPluginWorkerRuntime({
      pluginName: "github",
      pluginVersion: "1.0.0",
      modulePath: "/plugins/github.js",
      authorityId: "daemon://authority-1",
      provider,
      config: {
        enabled: true,
        intervalMs: 1_000,
        retryInitialMs: 100,
        retryMaxMs: 800,
        settings: {},
      },
      logger: createLogger(),
      getTodu: () => todu.instance,
    });

    const handle = runtime.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(todu.note.update).toHaveBeenNthCalledWith(1, localNote.id, {
      tags: ["sync:externalId:gh-comment-1"],
    });
    expect(todu.note.update).toHaveBeenNthCalledWith(
      2,
      localNote.id,
      expect.objectContaining({
        content: "remote edit",
        contentApproval: expect.objectContaining({
          state: "pendingApproval",
          sourceBindingId: binding.id,
        }),
      }),
    );

    handle.stop();
  });

  it("linked local-origin comments later delete remotely through explicit tombstones", async () => {
    const project = createProject();
    const task = createTask(project.id, { externalId: "gh-task-1" });
    const binding = createBinding(project.id, { strategy: "bidirectional" });
    const localNote = createNote({
      entityType: "task",
      entityId: task.id,
      content: "local comment",
    });
    const provider = createProvider({
      pull: vi
        .fn<SyncProvider["pull"]>()
        .mockResolvedValueOnce({ tasks: [], comments: [] })
        .mockResolvedValue({
          tasks: [],
          comments: [],
          deletedComments: [
            {
              externalId: "gh-comment-1",
              externalTaskId: task.externalId!,
              deletedAt: "2026-03-10T10:00:00Z",
            },
          ],
        }),
      push: vi
        .fn<SyncProvider["push"]>()
        .mockResolvedValueOnce({
          commentLinks: [
            {
              localNoteId: localNote.id,
              externalCommentId: "gh-comment-1",
              externalTaskId: task.id,
            },
          ],
          taskLinks: [],
        })
        .mockResolvedValue({ commentLinks: [], taskLinks: [] }),
    });
    const todu = createTodu(project, [task], [binding], { notes: [localNote] });

    const runtime = createSyncPluginWorkerRuntime({
      pluginName: "github",
      pluginVersion: "1.0.0",
      modulePath: "/plugins/github.js",
      authorityId: "daemon://authority-1",
      provider,
      config: {
        enabled: true,
        intervalMs: 1_000,
        retryInitialMs: 100,
        retryMaxMs: 800,
        settings: {},
      },
      logger: createLogger(),
      getTodu: () => todu.instance,
    });

    const handle = runtime.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(todu.note.delete).toHaveBeenCalledWith(localNote.id);

    handle.stop();
  });

  it("pull creates new tasks from pulled external tasks", async () => {
    const project = createProject();
    const binding = createBinding(project.id, { strategy: "pull" });
    const pulledTasks: ImportedTaskInput[] = [
      {
        externalId: "gh-101",
        title: "Pulled bug",
        description: "Imported from GitHub",
        status: "waiting",
        priority: "high",
        labels: ["bug"],
        assignees: [{ externalLogin: "octocat", displayName: "octocat" }],
        sourceUrl: "https://example.com/issues/101",
        createdAt: "2021-04-17T14:30:00Z",
        updatedAt: "2026-03-10T15:00:00Z",
      },
    ];
    const provider = createProvider({
      pull: vi.fn<SyncProvider["pull"]>().mockResolvedValue({
        tasks: pulledTasks,
      }),
    });
    const todu = createTodu(project, [], [binding]);

    const runtime = createSyncPluginWorkerRuntime({
      pluginName: "github",
      pluginVersion: "1.0.0",
      modulePath: "/plugins/github.js",
      authorityId: "daemon://authority-1",
      provider,
      config: {
        enabled: true,
        intervalMs: 1_000,
        retryInitialMs: 100,
        retryMaxMs: 800,
        settings: {},
      },
      logger: createLogger(),
      getTodu: () => todu.instance,
    });

    const handle = runtime.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(todu.project.update).toHaveBeenCalledWith(project.id, {
      authorizedAssigneeActorIds: expect.arrayContaining([createActorId("actor-user")]),
    });
    expect(todu.task.create).toHaveBeenCalledTimes(1);
    expect(todu.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Pulled bug",
        projectId: project.id,
        status: "waiting",
        priority: "high",
        description: "Imported from GitHub",
        descriptionApproval: expect.objectContaining({
          state: "pendingApproval",
          sourceBindingId: binding.id,
        }),
        labels: ["bug"],
        assignees: ["octocat"],
        assigneeActorIds: expect.arrayContaining([expect.stringMatching(/^actor-imported-/)]),
        externalId: "gh-101",
        sourceUrl: "https://example.com/issues/101",
        createdAt: "2021-04-17T14:30:00.000Z",
        updatedAt: "2026-03-10T15:00:00.000Z",
      }),
    );

    handle.stop();
  });

  it("pull updates existing tasks when external updatedAt is newer", async () => {
    const project = createProject();
    const existingTask = {
      ...createTask(project.id),
      externalId: "gh-101",
      createdAt: "2021-04-17T14:30:00Z",
      updatedAt: "2026-03-09T10:00:00Z",
    };
    const binding = createBinding(project.id, { strategy: "pull" });
    const pulledTasks: ImportedTaskInput[] = [
      {
        externalId: "gh-101",
        title: "Updated pulled bug",
        description: "Updated from GitHub",
        status: "inprogress",
        priority: "high",
        labels: ["bug", "synced"],
        assignees: [{ externalLogin: "octocat", displayName: "octocat" }],
        sourceUrl: "https://example.com/issues/101",
        updatedAt: "2026-03-10T15:00:00Z",
      },
    ];
    const provider = createProvider({
      pull: vi.fn<SyncProvider["pull"]>().mockResolvedValue({
        tasks: pulledTasks,
      }),
    });
    const todu = createTodu(project, [existingTask], [binding]);

    const runtime = createSyncPluginWorkerRuntime({
      pluginName: "github",
      pluginVersion: "1.0.0",
      modulePath: "/plugins/github.js",
      authorityId: "daemon://authority-1",
      provider,
      config: {
        enabled: true,
        intervalMs: 1_000,
        retryInitialMs: 100,
        retryMaxMs: 800,
        settings: {},
      },
      logger: createLogger(),
      getTodu: () => todu.instance,
    });

    const handle = runtime.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(todu.task.update).toHaveBeenCalledTimes(1);
    expect(todu.task.update).toHaveBeenCalledWith(
      existingTask.id,
      expect.objectContaining({
        title: "Updated pulled bug",
        status: "inprogress",
        priority: "high",
        description: "Updated from GitHub",
        descriptionApproval: expect.objectContaining({
          state: "pendingApproval",
          sourceBindingId: binding.id,
        }),
        labels: ["bug", "synced"],
        assignees: ["octocat"],
        assigneeActorIds: expect.arrayContaining([expect.stringMatching(/^actor-imported-/)]),
        externalId: "gh-101",
        sourceUrl: "https://example.com/issues/101",
        updatedAt: "2026-03-10T15:00:00.000Z",
      }),
    );

    handle.stop();
  });

  it("pull falls back imported updatedAt to createdAt when missing", async () => {
    const project = createProject();
    const binding = createBinding(project.id, { strategy: "pull" });
    const pulledTasks: ImportedTaskInput[] = [
      {
        externalId: "gh-101",
        title: "Pulled bug",
        description: "Imported from GitHub",
        status: "waiting",
        priority: "high",
        labels: ["bug"],
        assignees: [{ externalLogin: "octocat", displayName: "octocat" }],
        createdAt: "2021-04-17T14:30:00Z",
      },
    ];
    const provider = createProvider({
      pull: vi.fn<SyncProvider["pull"]>().mockResolvedValue({
        tasks: pulledTasks,
      }),
    });
    const todu = createTodu(project, [], [binding]);

    const runtime = createSyncPluginWorkerRuntime({
      pluginName: "github",
      pluginVersion: "1.0.0",
      modulePath: "/plugins/github.js",
      authorityId: "daemon://authority-1",
      provider,
      config: {
        enabled: true,
        intervalMs: 1_000,
        retryInitialMs: 100,
        retryMaxMs: 800,
        settings: {},
      },
      logger: createLogger(),
      getTodu: () => todu.instance,
    });

    const handle = runtime.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(todu.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Pulled bug",
        projectId: project.id,
        status: "waiting",
        priority: "high",
        description: "Imported from GitHub",
        descriptionApproval: expect.objectContaining({
          state: "pendingApproval",
          sourceBindingId: binding.id,
        }),
        labels: ["bug"],
        assignees: ["octocat"],
        assigneeActorIds: expect.arrayContaining([expect.stringMatching(/^actor-imported-/)]),
        externalId: "gh-101",
        createdAt: "2021-04-17T14:30:00.000Z",
        updatedAt: "2021-04-17T14:30:00.000Z",
      }),
    );

    handle.stop();
  });

  it("pull skips existing task updates when local task is newer", async () => {
    const project = createProject();
    const existingTask = {
      ...createTask(project.id),
      externalId: "gh-101",
      updatedAt: "2026-03-10T20:00:00Z",
    };
    const binding = createBinding(project.id, { strategy: "pull" });
    const pulledTasks: ImportedTaskInput[] = [
      {
        externalId: "gh-101",
        title: "Older pulled bug",
        description: "Older external state",
        updatedAt: "2026-03-10T12:00:00Z",
      },
    ];
    const provider = createProvider({
      pull: vi.fn<SyncProvider["pull"]>().mockResolvedValue({
        tasks: pulledTasks,
      }),
    });
    const todu = createTodu(project, [existingTask], [binding]);

    const runtime = createSyncPluginWorkerRuntime({
      pluginName: "github",
      pluginVersion: "1.0.0",
      modulePath: "/plugins/github.js",
      authorityId: "daemon://authority-1",
      provider,
      config: {
        enabled: true,
        intervalMs: 1_000,
        retryInitialMs: 100,
        retryMaxMs: 800,
        settings: {},
      },
      logger: createLogger(),
      getTodu: () => todu.instance,
    });

    const handle = runtime.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(todu.task.update).not.toHaveBeenCalled();
    expect(todu.task.create).not.toHaveBeenCalled();

    handle.stop();
  });

  it("pull fails safely when a pulled task timestamp is invalid", async () => {
    const project = createProject();
    const binding = createBinding(project.id, { strategy: "pull" });
    const pulledTasks: ImportedTaskInput[] = [
      {
        externalId: "gh-101",
        title: "Pulled bug",
        createdAt: "not-a-date",
      },
    ];
    const provider = createProvider({
      pull: vi.fn<SyncProvider["pull"]>().mockResolvedValue({
        tasks: pulledTasks,
      }),
    });
    const todu = createTodu(project, [], [binding]);

    const runtime = createSyncPluginWorkerRuntime({
      pluginName: "github",
      pluginVersion: "1.0.0",
      modulePath: "/plugins/github.js",
      authorityId: "daemon://authority-1",
      provider,
      config: {
        enabled: true,
        intervalMs: 1_000,
        retryInitialMs: 100,
        retryMaxMs: 800,
        settings: {},
      },
      logger: createLogger(),
      getTodu: () => todu.instance,
    });

    const handle = runtime.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(todu.task.create).not.toHaveBeenCalled();
    expect(todu.task.update).not.toHaveBeenCalled();

    handle.stop();
  });

  it("pull creates new comments as notes when externalId is not present locally", async () => {
    const project = createProject();
    const task = createTask(project.id, { externalId: "gh-task-1" });
    const binding = createBinding(project.id, { strategy: "pull" });
    const pulledComments: ImportedCommentInput[] = [
      {
        externalId: "gh-comment-1",
        externalTaskId: task.externalId!,
        body: "New comment from GitHub",
        author: { externalLogin: "octocat", displayName: "octocat" },
        createdAt: "2026-03-10T10:00:00Z",
      },
    ];
    const provider = createProvider({
      pull: vi.fn<SyncProvider["pull"]>().mockResolvedValue({
        tasks: [],
        comments: pulledComments,
      }),
    });
    const todu = createTodu(project, [task], [binding]);

    const runtime = createSyncPluginWorkerRuntime({
      pluginName: "github",
      pluginVersion: "1.0.0",
      modulePath: "/plugins/github.js",
      authorityId: "daemon://authority-1",
      provider,
      config: {
        enabled: true,
        intervalMs: 1_000,
        retryInitialMs: 100,
        retryMaxMs: 800,
        settings: {},
      },
      logger: createLogger(),
      getTodu: () => todu.instance,
    });

    const handle = runtime.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(todu.note.create).toHaveBeenCalledTimes(1);
    expect(todu.note.create).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "New comment from GitHub",
        author: "octocat",
        authorActorId: expect.stringMatching(/^actor-imported-/),
        contentApproval: expect.objectContaining({
          state: "pendingApproval",
          sourceBindingId: binding.id,
          sourceActorId: expect.stringMatching(/^actor-imported-/),
        }),
        entityType: "task",
        entityId: task.id,
        tags: [],
        createdAt: "2026-03-10T10:00:00.000Z",
      }),
    );

    handle.stop();
  });

  it("bidirectional sync exposes provenance for newly imported comments before push", async () => {
    const project = createProject();
    const task = createTask(project.id, { externalId: "gh-task-1" });
    const binding = createBinding(project.id, { strategy: "bidirectional" });
    const provider = createProvider({
      pull: vi.fn<SyncProvider["pull"]>().mockResolvedValue({
        tasks: [],
        comments: [
          {
            externalId: "gh-comment-1",
            externalTaskId: task.externalId!,
            body: "Imported comment",
            createdAt: "2026-03-10T10:00:00Z",
          },
        ],
      }),
    });
    const todu = createTodu(project, [task], [binding]);

    const runtime = createSyncPluginWorkerRuntime({
      pluginName: "github",
      pluginVersion: "1.0.0",
      modulePath: "/plugins/github.js",
      authorityId: "daemon://authority-1",
      provider,
      config: {
        enabled: true,
        intervalMs: 1_000,
        retryInitialMs: 100,
        retryMaxMs: 800,
        settings: {},
      },
      logger: createLogger(),
      getTodu: () => todu.instance,
    });

    const handle = runtime.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(todu.note.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: [],
      }),
    );
    expect(provider.push).toHaveBeenCalledWith(
      binding,
      [
        expect.objectContaining({
          comments: [
            expect.objectContaining({
              body: "Imported comment",
              externalId: "gh-comment-1",
              provenance: expect.objectContaining({
                bindingId: binding.id,
                externalTaskId: task.externalId,
                externalCommentId: "gh-comment-1",
              }),
            }),
          ],
        }),
      ],
      project,
    );

    handle.stop();
  });

  it("pull updates existing comments when external updatedAt is newer", async () => {
    const project = createProject();
    const task = createTask(project.id, { externalId: "gh-task-1" });
    const binding = createBinding(project.id, { strategy: "pull" });
    const existingNote = createNote({
      entityType: "task",
      entityId: task.id,
      content: "old content",
      tags: ["sync:externalId:gh-comment-1"],
      createdAt: "2026-03-09T10:00:00Z",
    });
    const pulledComments: ImportedCommentInput[] = [
      {
        externalId: "gh-comment-1",
        externalTaskId: task.externalId!,
        body: "Updated content from GitHub",
        author: { externalLogin: "octocat", displayName: "octocat" },
        createdAt: "2026-03-09T10:00:00Z",
        updatedAt: "2026-03-10T15:00:00Z",
      },
    ];
    const provider = createProvider({
      pull: vi.fn<SyncProvider["pull"]>().mockResolvedValue({
        tasks: [],
        comments: pulledComments,
      }),
    });
    const todu = createTodu(project, [task], [binding], { notes: [existingNote] });

    const runtime = createSyncPluginWorkerRuntime({
      pluginName: "github",
      pluginVersion: "1.0.0",
      modulePath: "/plugins/github.js",
      authorityId: "daemon://authority-1",
      provider,
      config: {
        enabled: true,
        intervalMs: 1_000,
        retryInitialMs: 100,
        retryMaxMs: 800,
        settings: {},
      },
      logger: createLogger(),
      getTodu: () => todu.instance,
    });

    const handle = runtime.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(todu.note.create).not.toHaveBeenCalled();
    expect(todu.note.update).toHaveBeenCalledTimes(1);
    expect(todu.note.update).toHaveBeenCalledWith(
      existingNote.id,
      expect.objectContaining({
        content: "Updated content from GitHub",
        authorActorId: expect.stringMatching(/^actor-imported-/),
        contentApproval: expect.objectContaining({
          state: "pendingApproval",
          sourceBindingId: binding.id,
          sourceActorId: expect.stringMatching(/^actor-imported-/),
        }),
      }),
    );

    handle.stop();
  });

  it("pull preserves local synced notes absent from partial pull result", async () => {
    const project = createProject();
    const task = createTask(project.id, { externalId: "gh-task-1" });
    const binding = createBinding(project.id, { strategy: "pull" });
    const omittedNote = createNote({
      entityType: "task",
      entityId: task.id,
      content: "omitted from partial pull",
      tags: ["sync:externalId:gh-comment-omitted"],
    });
    const provider = createProvider({
      pull: vi.fn<SyncProvider["pull"]>().mockResolvedValue({
        tasks: [],
        comments: [
          {
            externalId: "gh-comment-other",
            externalTaskId: task.externalId!,
            body: "changed in partial pull",
            createdAt: "2026-03-10T10:00:00Z",
          },
        ],
      }),
    });
    const todu = createTodu(project, [task], [binding], { notes: [omittedNote] });

    const runtime = createSyncPluginWorkerRuntime({
      pluginName: "github",
      pluginVersion: "1.0.0",
      modulePath: "/plugins/github.js",
      authorityId: "daemon://authority-1",
      provider,
      config: {
        enabled: true,
        intervalMs: 1_000,
        retryInitialMs: 100,
        retryMaxMs: 800,
        settings: {},
      },
      logger: createLogger(),
      getTodu: () => todu.instance,
    });

    const handle = runtime.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(todu.note.delete).not.toHaveBeenCalled();
    expect(todu.note.create).toHaveBeenCalledTimes(1);

    handle.stop();
  });

  it("pull deletes local synced notes from explicit comment tombstones", async () => {
    const project = createProject();
    const task = createTask(project.id, { externalId: "gh-task-1" });
    const binding = createBinding(project.id, { strategy: "pull" });
    const deletedNote = createNote({
      entityType: "task",
      entityId: task.id,
      content: "will be deleted",
      tags: ["sync:externalId:gh-comment-deleted"],
    });
    const provider = createProvider({
      pull: vi.fn<SyncProvider["pull"]>().mockResolvedValue({
        tasks: [],
        comments: [],
        deletedComments: [
          {
            externalId: "gh-comment-deleted",
            externalTaskId: task.externalId!,
            deletedAt: "2026-03-10T10:00:00Z",
          },
        ],
      }),
    });
    const todu = createTodu(project, [task], [binding], { notes: [deletedNote] });

    const runtime = createSyncPluginWorkerRuntime({
      pluginName: "github",
      pluginVersion: "1.0.0",
      modulePath: "/plugins/github.js",
      authorityId: "daemon://authority-1",
      provider,
      config: {
        enabled: true,
        intervalMs: 1_000,
        retryInitialMs: 100,
        retryMaxMs: 800,
        settings: {},
      },
      logger: createLogger(),
      getTodu: () => todu.instance,
    });

    const handle = runtime.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(todu.note.delete).toHaveBeenCalledTimes(1);
    expect(todu.note.delete).toHaveBeenCalledWith(deletedNote.id);

    handle.stop();
  });

  it("pull deletes local synced notes absent from complete comment snapshots", async () => {
    const project = createProject();
    const task = createTask(project.id, { externalId: "gh-task-1" });
    const binding = createBinding(project.id, { strategy: "pull" });
    const deletedNote = createNote({
      entityType: "task",
      entityId: task.id,
      content: "missing from complete snapshot",
      tags: ["sync:externalId:gh-comment-deleted"],
    });
    const provider = createProvider({
      pull: vi.fn<SyncProvider["pull"]>().mockResolvedValue({
        tasks: [],
        comments: [
          {
            externalId: "gh-comment-other",
            externalTaskId: task.externalId!,
            body: "still exists",
            createdAt: "2026-03-10T10:00:00Z",
          },
        ],
        completeCommentExternalTaskIds: [task.externalId!],
      }),
    });
    const todu = createTodu(project, [task], [binding], { notes: [deletedNote] });

    const runtime = createSyncPluginWorkerRuntime({
      pluginName: "github",
      pluginVersion: "1.0.0",
      modulePath: "/plugins/github.js",
      authorityId: "daemon://authority-1",
      provider,
      config: {
        enabled: true,
        intervalMs: 1_000,
        retryInitialMs: 100,
        retryMaxMs: 800,
        settings: {},
      },
      logger: createLogger(),
      getTodu: () => todu.instance,
    });

    const handle = runtime.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(todu.note.delete).toHaveBeenCalledTimes(1);
    expect(todu.note.delete).toHaveBeenCalledWith(deletedNote.id);
    expect(todu.note.create).toHaveBeenCalledTimes(1);

    handle.stop();
  });

  it("pull skips update when local note is newer than external comment", async () => {
    const project = createProject();
    const task = createTask(project.id, { externalId: "gh-task-1" });
    const binding = createBinding(project.id, { strategy: "pull" });
    const existingNote = createNote({
      entityType: "task",
      entityId: task.id,
      content: "locally edited content",
      tags: ["sync:externalId:gh-comment-1"],
      createdAt: "2026-03-10T20:00:00Z",
    });
    const pulledComments: ImportedCommentInput[] = [
      {
        externalId: "gh-comment-1",
        externalTaskId: task.externalId!,
        body: "Older external content",
        author: { externalLogin: "octocat", displayName: "octocat" },
        createdAt: "2026-03-09T10:00:00Z",
        updatedAt: "2026-03-10T12:00:00Z",
      },
    ];
    const provider = createProvider({
      pull: vi.fn<SyncProvider["pull"]>().mockResolvedValue({
        tasks: [],
        comments: pulledComments,
      }),
    });
    const todu = createTodu(project, [task], [binding], { notes: [existingNote] });

    const runtime = createSyncPluginWorkerRuntime({
      pluginName: "github",
      pluginVersion: "1.0.0",
      modulePath: "/plugins/github.js",
      authorityId: "daemon://authority-1",
      provider,
      config: {
        enabled: true,
        intervalMs: 1_000,
        retryInitialMs: 100,
        retryMaxMs: 800,
        settings: {},
      },
      logger: createLogger(),
      getTodu: () => todu.instance,
    });

    const handle = runtime.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(todu.note.update).not.toHaveBeenCalled();
    expect(todu.note.create).not.toHaveBeenCalled();
    expect(todu.note.delete).not.toHaveBeenCalled();

    handle.stop();
  });

  it("pull does not modify local notes without sync tags or provenance", async () => {
    const project = createProject();
    const task = createTask(project.id, { externalId: "gh-task-1" });
    const binding = createBinding(project.id, { strategy: "pull" });
    const localNote = createNote({
      entityType: "task",
      entityId: task.id,
      content: "ordinary user note",
      tags: [],
    });
    const provider = createProvider({
      pull: vi.fn<SyncProvider["pull"]>().mockResolvedValue({
        tasks: [],
        comments: [],
      }),
    });
    const todu = createTodu(project, [task], [binding], { notes: [localNote] });

    const runtime = createSyncPluginWorkerRuntime({
      pluginName: "github",
      pluginVersion: "1.0.0",
      modulePath: "/plugins/github.js",
      authorityId: "daemon://authority-1",
      provider,
      config: {
        enabled: true,
        intervalMs: 1_000,
        retryInitialMs: 100,
        retryMaxMs: 800,
        settings: {},
      },
      logger: createLogger(),
      getTodu: () => todu.instance,
    });

    const handle = runtime.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(todu.note.update).not.toHaveBeenCalled();
    expect(todu.note.delete).not.toHaveBeenCalled();

    handle.stop();
  });

  it("pull skips comments whose tasks are not imported locally", async () => {
    const project = createProject();
    const task = createTask(project.id, { externalId: "gh-task-1" });
    const binding = createBinding(project.id, { strategy: "pull" });
    const provider = createProvider({
      pull: vi.fn<SyncProvider["pull"]>().mockResolvedValue({
        tasks: [],
        comments: [
          {
            externalId: "gh-comment-1",
            externalTaskId: "gh-task-missing",
            body: "Skipped because task is not imported",
            author: { externalLogin: "octocat", displayName: "octocat" },
            createdAt: "2026-03-10T10:00:00Z",
          },
        ],
      }),
    });
    const todu = createTodu(project, [task], [binding]);

    const runtime = createSyncPluginWorkerRuntime({
      pluginName: "github",
      pluginVersion: "1.0.0",
      modulePath: "/plugins/github.js",
      authorityId: "daemon://authority-1",
      provider,
      config: {
        enabled: true,
        intervalMs: 1_000,
        retryInitialMs: 100,
        retryMaxMs: 800,
        settings: {},
      },
      logger: createLogger(),
      getTodu: () => todu.instance,
    });

    const handle = runtime.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(todu.note.list).not.toHaveBeenCalled();
    expect(todu.note.create).not.toHaveBeenCalled();
    expect(todu.note.update).not.toHaveBeenCalled();
    expect(todu.note.delete).not.toHaveBeenCalled();

    handle.stop();
  });

  it("pull truncates task description that exceeds MAX_DESCRIPTION_LENGTH", async () => {
    const project = createProject();
    const binding = createBinding(project.id, { strategy: "pull" });
    const overLimitDescription = "x".repeat(10001);
    const provider = createProvider({
      pull: vi.fn<SyncProvider["pull"]>().mockResolvedValue({
        tasks: [
          {
            externalId: "gh-task-1",
            title: "Task with long description",
            description: overLimitDescription,
            createdAt: "2026-01-01T00:00:00Z",
          },
        ],
      }),
    });
    const todu = createTodu(project, [], [binding]);

    const runtime = createSyncPluginWorkerRuntime({
      pluginName: "github",
      pluginVersion: "1.0.0",
      modulePath: "/plugins/github.js",
      authorityId: "daemon://authority-1",
      provider,
      config: {
        enabled: true,
        intervalMs: 1_000,
        retryInitialMs: 100,
        retryMaxMs: 800,
        settings: {},
      },
      logger: createLogger(),
      getTodu: () => todu.instance,
    });

    const handle = runtime.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(todu.task.create).toHaveBeenCalledTimes(1);
    const createdDescription = todu.task.create.mock.calls[0][0].description as string;
    expect(createdDescription.length).toBe(10000);
    expect(createdDescription.endsWith("... [truncated]")).toBe(true);

    handle.stop();
  });

  it("pull does not truncate task description within MAX_DESCRIPTION_LENGTH", async () => {
    const project = createProject();
    const binding = createBinding(project.id, { strategy: "pull" });
    const atLimitDescription = "x".repeat(10000);
    const provider = createProvider({
      pull: vi.fn<SyncProvider["pull"]>().mockResolvedValue({
        tasks: [
          {
            externalId: "gh-task-1",
            title: "Task with at-limit description",
            description: atLimitDescription,
            createdAt: "2026-01-01T00:00:00Z",
          },
        ],
      }),
    });
    const todu = createTodu(project, [], [binding]);

    const runtime = createSyncPluginWorkerRuntime({
      pluginName: "github",
      pluginVersion: "1.0.0",
      modulePath: "/plugins/github.js",
      authorityId: "daemon://authority-1",
      provider,
      config: {
        enabled: true,
        intervalMs: 1_000,
        retryInitialMs: 100,
        retryMaxMs: 800,
        settings: {},
      },
      logger: createLogger(),
      getTodu: () => todu.instance,
    });

    const handle = runtime.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(todu.task.create).toHaveBeenCalledTimes(1);
    const createdDescription = todu.task.create.mock.calls[0][0].description as string;
    expect(createdDescription).toBe(atLimitDescription);

    handle.stop();
  });

  it("pull truncates note body that exceeds MAX_NOTE_CONTENT_LENGTH when creating", async () => {
    const project = createProject();
    const task = createTask(project.id, { externalId: "gh-task-1" });
    const binding = createBinding(project.id, { strategy: "pull" });
    const overLimitBody = "y".repeat(10001);
    const provider = createProvider({
      pull: vi.fn<SyncProvider["pull"]>().mockResolvedValue({
        tasks: [],
        comments: [
          {
            externalId: "gh-comment-1",
            externalTaskId: task.externalId!,
            body: overLimitBody,
            author: { externalLogin: "octocat", displayName: "octocat" },
            createdAt: "2026-01-01T00:00:00Z",
          },
        ],
      }),
    });
    const todu = createTodu(project, [task], [binding]);

    const runtime = createSyncPluginWorkerRuntime({
      pluginName: "github",
      pluginVersion: "1.0.0",
      modulePath: "/plugins/github.js",
      authorityId: "daemon://authority-1",
      provider,
      config: {
        enabled: true,
        intervalMs: 1_000,
        retryInitialMs: 100,
        retryMaxMs: 800,
        settings: {},
      },
      logger: createLogger(),
      getTodu: () => todu.instance,
    });

    const handle = runtime.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(todu.note.create).toHaveBeenCalledTimes(1);
    const createdContent = todu.note.create.mock.calls[0][0].content as string;
    expect(createdContent.length).toBe(10000);
    expect(createdContent.endsWith("... [truncated]")).toBe(true);

    handle.stop();
  });

  it("pull truncates note body that exceeds MAX_NOTE_CONTENT_LENGTH when updating", async () => {
    const project = createProject();
    const task = createTask(project.id, { externalId: "gh-task-1" });
    const binding = createBinding(project.id, { strategy: "pull" });
    const existingNote = createNote({
      entityType: "task",
      entityId: task.id,
      content: "old content",
      tags: ["sync:externalId:gh-comment-1"],
      createdAt: "2026-01-01T00:00:00Z",
    });
    const overLimitBody = "y".repeat(10001);
    const provider = createProvider({
      pull: vi.fn<SyncProvider["pull"]>().mockResolvedValue({
        tasks: [],
        comments: [
          {
            externalId: "gh-comment-1",
            externalTaskId: task.externalId!,
            body: overLimitBody,
            author: { externalLogin: "octocat", displayName: "octocat" },
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-02T00:00:00Z",
          },
        ],
      }),
    });
    const todu = createTodu(project, [task], [binding], { notes: [existingNote] });

    const runtime = createSyncPluginWorkerRuntime({
      pluginName: "github",
      pluginVersion: "1.0.0",
      modulePath: "/plugins/github.js",
      authorityId: "daemon://authority-1",
      provider,
      config: {
        enabled: true,
        intervalMs: 1_000,
        retryInitialMs: 100,
        retryMaxMs: 800,
        settings: {},
      },
      logger: createLogger(),
      getTodu: () => todu.instance,
    });

    const handle = runtime.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(todu.note.update).toHaveBeenCalledTimes(1);
    const updatedContent = todu.note.update.mock.calls[0][1].content as string;
    expect(updatedContent.length).toBe(10000);
    expect(updatedContent.endsWith("... [truncated]")).toBe(true);

    handle.stop();
  });

  it("pull does not truncate note body within MAX_NOTE_CONTENT_LENGTH", async () => {
    const project = createProject();
    const task = createTask(project.id, { externalId: "gh-task-1" });
    const binding = createBinding(project.id, { strategy: "pull" });
    const atLimitBody = "y".repeat(10000);
    const provider = createProvider({
      pull: vi.fn<SyncProvider["pull"]>().mockResolvedValue({
        tasks: [],
        comments: [
          {
            externalId: "gh-comment-1",
            externalTaskId: task.externalId!,
            body: atLimitBody,
            author: { externalLogin: "octocat", displayName: "octocat" },
            createdAt: "2026-01-01T00:00:00Z",
          },
        ],
      }),
    });
    const todu = createTodu(project, [task], [binding]);

    const runtime = createSyncPluginWorkerRuntime({
      pluginName: "github",
      pluginVersion: "1.0.0",
      modulePath: "/plugins/github.js",
      authorityId: "daemon://authority-1",
      provider,
      config: {
        enabled: true,
        intervalMs: 1_000,
        retryInitialMs: 100,
        retryMaxMs: 800,
        settings: {},
      },
      logger: createLogger(),
      getTodu: () => todu.instance,
    });

    const handle = runtime.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(todu.note.create).toHaveBeenCalledTimes(1);
    const createdContent = todu.note.create.mock.calls[0][0].content as string;
    expect(createdContent).toBe(atLimitBody);

    handle.stop();
  });

  it("reuses trusted actor mappings during pull and skips approval for mapped note authors", async () => {
    const project = createProject();
    const task = createTask(project.id, { externalId: "gh-task-1" });
    const binding = createBinding(project.id, {
      strategy: "pull",
      options: {
        actorMappings: [
          {
            actorId: createActorId("actor-octocat"),
            externalLogin: "octocat",
            displayName: "octocat",
            trusted: true,
          },
        ],
      },
    });
    const provider = createProvider({
      pull: vi.fn<SyncProvider["pull"]>().mockResolvedValue({
        tasks: [
          {
            externalId: "gh-101",
            title: "Pulled bug",
            description: "Imported from GitHub",
            assignees: [{ externalLogin: "octocat", displayName: "octocat" }],
            createdAt: "2026-01-01T00:00:00Z",
          },
        ],
        comments: [
          {
            externalId: "gh-comment-1",
            externalTaskId: task.externalId!,
            body: "Trusted comment",
            author: { externalLogin: "octocat", displayName: "octocat" },
            createdAt: "2026-01-01T00:00:00Z",
          },
        ],
      }),
    });
    const todu = createTodu(project, [task], [binding], {
      actors: [{ id: createActorId("actor-octocat"), displayName: "octocat" }],
    });

    const runtime = createSyncPluginWorkerRuntime({
      pluginName: "github",
      pluginVersion: "1.0.0",
      modulePath: "/plugins/github.js",
      authorityId: "daemon://authority-1",
      provider,
      config: {
        enabled: true,
        intervalMs: 1_000,
        retryInitialMs: 100,
        retryMaxMs: 800,
        settings: {},
      },
      logger: createLogger(),
      getTodu: () => todu.instance,
    });

    const handle = runtime.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(todu.integration.update).not.toHaveBeenCalled();
    expect(todu.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        assigneeActorIds: [createActorId("actor-octocat")],
      }),
    );
    expect(todu.note.create).toHaveBeenCalledWith(
      expect.objectContaining({
        authorActorId: createActorId("actor-octocat"),
        contentApproval: expect.objectContaining({
          state: "notRequired",
          sourceBindingId: binding.id,
          sourceActorId: createActorId("actor-octocat"),
        }),
      }),
    );

    handle.stop();
  });

  it("executes the v3 import path and auto-creates actor mappings", async () => {
    const project = createProject();
    const task = createTask(project.id, { externalId: "gh-task-1" });
    const binding = createBinding(project.id, { strategy: "pull" });
    const provider = createV3Provider({
      pull: vi.fn<SyncProviderV3["pull"]>().mockResolvedValue({
        tasks: [
          {
            externalId: "gh-101",
            title: "Pulled via v3",
            description: "Imported from v3",
            assignees: [{ externalLogin: "octocat", displayName: "Octocat" }],
            createdAt: "2026-01-01T00:00:00Z",
          } satisfies ImportedTaskInput,
        ],
        comments: [
          {
            externalId: "gh-comment-1",
            externalTaskId: task.externalId!,
            body: "Imported comment",
            author: { externalLogin: "octobot", displayName: "Octobot" },
            createdAt: "2026-01-02T00:00:00Z",
          } satisfies ImportedCommentInput,
        ],
      }),
    });
    const todu = createTodu(project, [task], [binding]);

    const runtime = createSyncPluginWorkerRuntime({
      pluginName: "github",
      pluginVersion: "1.0.0",
      modulePath: "/plugins/github.js",
      authorityId: "daemon://authority-1",
      provider,
      providerApiVersion: 3,
      config: {
        enabled: true,
        intervalMs: 1_000,
        retryInitialMs: 100,
        retryMaxMs: 800,
        settings: {},
      },
      logger: createLogger(),
      getTodu: () => todu.instance,
    });

    const handle = runtime.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(todu.integration.update).toHaveBeenCalledTimes(1);
    expect(todu.integration.update).toHaveBeenCalledWith(
      binding.id,
      expect.objectContaining({
        options: expect.objectContaining({
          actorMappings: expect.arrayContaining([
            expect.objectContaining({
              externalLogin: "octocat",
              trusted: false,
            }),
            expect.objectContaining({
              externalLogin: "octobot",
              trusted: false,
            }),
          ]),
        }),
      }),
    );
    expect(todu.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Pulled via v3",
        assigneeActorIds: expect.arrayContaining([expect.stringMatching(/^actor-imported-/)]),
        descriptionApproval: expect.objectContaining({
          state: "pendingApproval",
          sourceBindingId: binding.id,
        }),
      }),
    );
    expect(todu.note.create).toHaveBeenCalledWith(
      expect.objectContaining({
        authorActorId: expect.stringMatching(/^actor-imported-/),
        contentApproval: expect.objectContaining({
          state: "pendingApproval",
          sourceBindingId: binding.id,
          sourceActorId: expect.stringMatching(/^actor-imported-/),
        }),
      }),
    );

    handle.stop();
  });

  it("pull imports newer remote assignee removals on the v3 path", async () => {
    const project = createProject();
    const existingTask = createTask(project.id, {
      externalId: "gh-101",
      assigneeActorIds: [createActorId("actor-octocat")],
      assignees: ["octocat"],
      updatedAt: "2026-03-10T09:00:00Z",
    });
    const binding = createBinding(project.id, { strategy: "pull" });
    const provider = createV3Provider({
      pull: vi.fn<SyncProviderV3["pull"]>().mockResolvedValue({
        tasks: [
          {
            externalId: "gh-101",
            title: "Pulled via v3",
            assignees: [],
            updatedAt: "2026-03-10T15:00:00Z",
          } satisfies ImportedTaskInput,
        ],
        comments: [],
      }),
    });
    const todu = createTodu(project, [existingTask], [binding], {
      actors: [{ id: createActorId("actor-octocat"), displayName: "Octocat" }],
    });

    const runtime = createSyncPluginWorkerRuntime({
      pluginName: "github",
      pluginVersion: "1.0.0",
      modulePath: "/plugins/github.js",
      authorityId: "daemon://authority-1",
      provider,
      providerApiVersion: 3,
      config: {
        enabled: true,
        intervalMs: 1_000,
        retryInitialMs: 100,
        retryMaxMs: 800,
        settings: {},
      },
      logger: createLogger(),
      getTodu: () => todu.instance,
    });

    const handle = runtime.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(todu.task.update).toHaveBeenCalledWith(
      existingTask.id,
      expect.objectContaining({
        assigneeActorIds: [],
        assignees: [],
        updatedAt: "2026-03-10T15:00:00.000Z",
      }),
    );

    handle.stop();
  });

  it("includes updatedAt in v3 push payloads so providers can resolve freshness conflicts", async () => {
    const project = createProject();
    const task = createTask(project.id, {
      externalId: "gh-101",
      updatedAt: "2026-03-10T15:00:00Z",
      assigneeActorIds: [createActorId("actor-mapped")],
    });
    const binding = createBinding(project.id, {
      strategy: "push",
      options: {
        actorMappings: [
          {
            actorId: createActorId("actor-mapped"),
            externalLogin: "octocat",
            displayName: "Octocat",
          },
        ],
      },
    });
    const provider = createV3Provider();
    const todu = createTodu(project, [task], [binding], {
      actors: [{ id: createActorId("actor-mapped"), displayName: "Mapped" }],
    });

    const runtime = createSyncPluginWorkerRuntime({
      pluginName: "github",
      pluginVersion: "1.0.0",
      modulePath: "/plugins/github.js",
      authorityId: "daemon://authority-1",
      provider,
      providerApiVersion: 3,
      config: {
        enabled: true,
        intervalMs: 1_000,
        retryInitialMs: 100,
        retryMaxMs: 800,
        settings: {},
      },
      logger: createLogger(),
      getTodu: () => todu.instance,
    });

    const handle = runtime.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(provider.push).toHaveBeenCalledWith(
      binding,
      [
        expect.objectContaining({
          localTaskId: task.id,
          updatedAt: "2026-03-10T15:00:00Z",
          assignees: [{ externalLogin: "octocat", displayName: "Octocat" }],
        }),
      ],
      expect.objectContaining({ id: project.id }),
    );

    handle.stop();
  });

  it("skips unmapped outbound assignees with warnings on the v3 push path", async () => {
    const project = createProject();
    const task = createTask(project.id, {
      assigneeActorIds: [createActorId("actor-mapped"), createActorId("actor-unmapped")],
    });
    const binding = createBinding(project.id, {
      strategy: "push",
      options: {
        actorMappings: [
          {
            actorId: createActorId("actor-mapped"),
            externalLogin: "octocat",
            displayName: "Octocat",
          },
        ],
      },
    });
    const provider = createV3Provider();
    const logger = createLogger();
    const todu = createTodu(project, [task], [binding], {
      actors: [
        { id: createActorId("actor-mapped"), displayName: "Mapped" },
        { id: createActorId("actor-unmapped"), displayName: "Unmapped" },
      ],
    });

    const runtime = createSyncPluginWorkerRuntime({
      pluginName: "github",
      pluginVersion: "1.0.0",
      modulePath: "/plugins/github.js",
      authorityId: "daemon://authority-1",
      provider,
      providerApiVersion: 3,
      config: {
        enabled: true,
        intervalMs: 1_000,
        retryInitialMs: 100,
        retryMaxMs: 800,
        settings: {},
      },
      logger,
      getTodu: () => todu.instance,
    });

    const handle = runtime.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(provider.push).toHaveBeenCalledWith(
      binding,
      [
        expect.objectContaining({
          localTaskId: task.id,
          assignees: [{ externalLogin: "octocat", displayName: "Octocat" }],
        }),
      ],
      expect.objectContaining({ id: project.id }),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      "sync plugin skipped unmapped outbound assignee",
      expect.objectContaining({
        bindingId: binding.id,
        taskId: task.id,
        actorId: createActorId("actor-unmapped"),
      }),
    );

    handle.stop();
  });
});

describe("acknowledged pulls", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("applies and saves tasks, comments, provenance and mappings before acknowledging, then pushes", async () => {
    const { provider, todu, binding, project, checkpoint, handle } = createAcknowledgedPull();
    const flush = vi.mocked(todu.instance.__internal.syncRuntime.flush);
    const saving = createDeferred<void>();
    flush.mockReturnValueOnce(saving.promise);
    await vi.advanceTimersByTimeAsync(0);
    expect(todu.task.create).toHaveBeenCalledTimes(1);
    expect(todu.note.update).toHaveBeenCalledTimes(1);
    expect(todu.instance.__internal.syncRuntime.notes.createWithId).toHaveBeenCalledTimes(1);
    expect(todu.integration.update).toHaveBeenCalledTimes(1);
    expect(provider.acknowledgePull).not.toHaveBeenCalled();
    expect(provider.push).not.toHaveBeenCalled();
    saving.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(provider.acknowledgePull).toHaveBeenCalledWith(
      binding,
      checkpoint,
      expect.objectContaining({ id: project.id }),
    );
    expect(vi.mocked(provider.acknowledgePull).mock.calls[0][1]).toBe(checkpoint);
    expect(vi.mocked(provider.acknowledgePull).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(provider.push).mock.invocationCallOrder[0],
    );
    expect(todu.integration.updateStatus).toHaveBeenLastCalledWith(
      binding.id,
      expect.objectContaining({ state: "idle", lastSuccessfulSyncAt: expect.any(String) }),
    );
    handle.stop();
  });

  it("acknowledges empty pulls after saving local state", async () => {
    const { provider, todu, handle } = createAcknowledgedPull();
    vi.mocked(provider.pull).mockResolvedValue({ tasks: [], checkpoint: null });
    await vi.advanceTimersByTimeAsync(0);
    expect(todu.instance.__internal.syncRuntime.flush).toHaveBeenCalledTimes(1);
    expect(provider.acknowledgePull).toHaveBeenCalledWith(
      expect.anything(),
      null,
      expect.anything(),
    );
    handle.stop();
  });

  it.each([
    "task create",
    "task update",
    "comment read",
    "comment create",
    "comment update",
    "comment delete",
    "provenance list",
    "provenance upsert",
    "provenance delete",
    "mapping",
    "flush",
  ])("does not acknowledge or push when %s fails, and replays without duplicates", async (phase) => {
    const { provider, todu, binding, handle } = createAcknowledgedPull();
    const internals = todu.instance.__internal.syncRuntime;
    const failure = err(validationError("test", `${phase} failed`));
    switch (phase) {
      case "task create":
        todu.task.create.mockResolvedValueOnce(failure);
        break;
      case "task update":
        todu.task.update.mockResolvedValueOnce(failure);
        break;
      case "comment read":
        todu.note.list.mockResolvedValueOnce(failure);
        break;
      case "comment create":
        vi.mocked(internals.notes.createWithId).mockResolvedValueOnce(failure);
        break;
      case "comment update":
        todu.note.update.mockResolvedValueOnce(failure);
        break;
      case "comment delete":
        todu.note.delete.mockResolvedValueOnce(failure);
        break;
      case "provenance list":
        vi.mocked(internals.commentProvenance.list).mockResolvedValueOnce(failure);
        break;
      case "provenance upsert":
        vi.mocked(internals.commentProvenance.upsert).mockResolvedValueOnce(failure);
        break;
      case "provenance delete":
        vi.mocked(internals.commentProvenance.deleteForNote).mockResolvedValueOnce(failure);
        break;
      case "mapping":
        todu.integration.update.mockResolvedValueOnce(failure);
        break;
      case "flush":
        vi.mocked(internals.flush).mockRejectedValueOnce(new Error("storage failed"));
        break;
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(provider.acknowledgePull).not.toHaveBeenCalled();
    expect(provider.push).not.toHaveBeenCalled();
    expect(todu.integration.updateStatus).toHaveBeenLastCalledWith(
      binding.id,
      expect.objectContaining({ state: "error" }),
    );
    await vi.advanceTimersByTimeAsync(100);
    expect(provider.pull).toHaveBeenCalledTimes(2);
    expect(provider.acknowledgePull).toHaveBeenCalledTimes(1);
    const tasks = await todu.instance.task.list({ projectId: binding.projectId });
    expect(tasks.ok && tasks.value).toHaveLength(2);
    const notes = await todu.instance.note.list();
    expect(notes.ok && notes.value).toHaveLength(2);
    handle.stop();
  });

  it("recovers a created comment whose provenance write failed without duplicating it", async () => {
    const { provider, todu, handle } = createAcknowledgedPull();
    vi.mocked(provider.pull).mockResolvedValue({
      tasks: [],
      checkpoint: "comment-only",
      comments: [
        {
          externalId: "new-comment",
          externalTaskId: "remote-1",
          body: "new",
          createdAt: "2026-04-01T00:00:00.000Z",
        },
      ],
    });
    vi.mocked(todu.instance.__internal.syncRuntime.commentProvenance.upsert).mockRejectedValueOnce(
      new Error("provenance unavailable"),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(provider.acknowledgePull).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(provider.acknowledgePull).toHaveBeenCalledTimes(1);
    const notes = await todu.instance.note.list();
    expect(notes.ok && notes.value).toHaveLength(3);
    expect(todu.instance.__internal.syncRuntime.notes.createWithId).toHaveBeenCalledTimes(1);
    handle.stop();
  });

  it("retries an acknowledgment failure without duplicate imports or premature push", async () => {
    const { provider, todu, checkpoint, handle } = createAcknowledgedPull();
    vi.mocked(provider.acknowledgePull).mockRejectedValueOnce(new Error("checkpoint save failed"));
    await vi.advanceTimersByTimeAsync(0);
    expect(provider.push).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(provider.acknowledgePull).toHaveBeenCalledTimes(2);
    expect(vi.mocked(provider.acknowledgePull).mock.calls.map((call) => call[1])).toEqual([
      checkpoint,
      checkpoint,
    ]);
    expect(todu.task.create).toHaveBeenCalledTimes(1);
    expect(todu.instance.__internal.syncRuntime.notes.createWithId).toHaveBeenCalledTimes(1);
    expect(provider.push).toHaveBeenCalledTimes(1);
    handle.stop();
  });

  it("does not roll back an acknowledged pull when subsequent push fails", async () => {
    const { provider, handle } = createAcknowledgedPull();
    vi.mocked(provider.push).mockRejectedValueOnce(new Error("push failed"));
    await vi.advanceTimersByTimeAsync(0);
    expect(provider.acknowledgePull).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(provider.acknowledgePull).toHaveBeenCalledTimes(2);
    handle.stop();
  });

  it("does not acknowledge push-only bindings", async () => {
    const { provider, binding, handle } = createAcknowledgedPull();
    binding.strategy = "push";
    await vi.advanceTimersByTimeAsync(0);
    expect(provider.pull).not.toHaveBeenCalled();
    expect(provider.acknowledgePull).not.toHaveBeenCalled();
    expect(provider.push).toHaveBeenCalledTimes(1);
    handle.stop();
  });

  it.each([
    "comments",
    "deletedComments",
    "completeCommentExternalTaskIds",
  ] as const)("does not acknowledge %s for an unavailable task", async (field) => {
    const { provider, handle } = createAcknowledgedPull();
    const result = {
      tasks: [],
      checkpoint: "missing-task",
      [field]:
        field === "completeCommentExternalTaskIds"
          ? ["unknown-task"]
          : [
              {
                externalId: "comment",
                externalTaskId: "unknown-task",
                body: "body",
                createdAt: "2026-04-01T00:00:00.000Z",
              },
            ],
    };
    vi.mocked(provider.pull).mockResolvedValue(result);
    await vi.advanceTimersByTimeAsync(0);
    expect(provider.acknowledgePull).not.toHaveBeenCalled();
    expect(provider.push).not.toHaveBeenCalled();
    handle.stop();
  });

  it("deduplicates repeated comment identities within one pull batch", async () => {
    const { provider, todu, handle } = createAcknowledgedPull();
    const comment = {
      externalId: "same-comment",
      externalTaskId: "remote-1",
      body: "body",
      createdAt: "2026-04-01T00:00:00.000Z",
    };
    vi.mocked(provider.pull).mockResolvedValue({
      tasks: [],
      checkpoint: "repeated",
      comments: [comment, comment],
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(provider.acknowledgePull).toHaveBeenCalledTimes(1);
    expect(todu.instance.__internal.syncRuntime.notes.createWithId).toHaveBeenCalledTimes(1);
    handle.stop();
  });

  it.each([
    "read",
    "repair",
  ])("does not acknowledge when equal-timestamp task detail %s fails", async (phase) => {
    const { provider, todu, handle } = createAcknowledgedPull();
    vi.mocked(provider.pull).mockResolvedValue({
      tasks: [
        {
          externalId: "remote-1",
          title: "Task",
          description: "Restored detail",
          updatedAt: new Date(0).toISOString(),
        },
      ],
      checkpoint: "equal-timestamp",
    });
    const failure = err(validationError("detail", "unavailable"));
    if (phase === "read") todu.task.get.mockResolvedValueOnce(failure);
    else todu.task.update.mockResolvedValueOnce(failure);
    await vi.advanceTimersByTimeAsync(0);
    expect(provider.acknowledgePull).not.toHaveBeenCalled();
    expect(provider.push).not.toHaveBeenCalled();
    handle.stop();
  });

  it("does not rewrite matching v4 replay content or reset its approval", async () => {
    const { provider, todu, handle } = createAcknowledgedPull();
    vi.mocked(provider.pull).mockResolvedValue({
      tasks: [
        {
          externalId: "remote-1",
          title: "Task",
          description: "Approved detail",
          updatedAt: new Date(0).toISOString(),
        },
      ],
      checkpoint: "already-saved",
    });
    todu.task.get.mockResolvedValueOnce(
      ok({
        ...createTask(createProject().id, { externalId: "remote-1" }),
        description: "Approved detail",
        descriptionApproval: { state: "approved" },
      }),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(provider.acknowledgePull).toHaveBeenCalledTimes(1);
    expect(todu.task.update).not.toHaveBeenCalled();
    handle.stop();
  });

  it("preserves v3 equal-timestamp skip behavior", async () => {
    const { provider, todu, handle } = createAcknowledgedPull(3);
    vi.mocked(provider.pull).mockResolvedValue({
      tasks: [
        {
          externalId: "remote-1",
          title: "Task",
          description: "Remote detail",
          updatedAt: new Date(0).toISOString(),
        },
      ],
      checkpoint: "legacy",
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(todu.task.update).not.toHaveBeenCalled();
    expect(provider.acknowledgePull).not.toHaveBeenCalled();
    handle.stop();
  });

  it("rejects a malformed v4 pull without a checkpoint", async () => {
    const { provider, handle } = createAcknowledgedPull();
    vi.mocked(provider.pull).mockResolvedValue({ tasks: [] } as never);
    await vi.advanceTimersByTimeAsync(0);
    expect(provider.acknowledgePull).not.toHaveBeenCalled();
    expect(provider.push).not.toHaveBeenCalled();
    handle.stop();
  });

  it("does not opt a v4 registration into field-group processing through extra payload fields", async () => {
    const { provider, todu, handle } = createAcknowledgedPull();
    vi.mocked(provider.pull).mockResolvedValue({
      tasks: [],
      checkpoint: null,
      taskUpdates: [
        {
          externalId: "remote-1",
          groups: { workflow: { base: { status: "active" }, remote: { status: "done" } } },
        },
      ],
    } as never);
    await vi.advanceTimersByTimeAsync(0);
    expect(todu.task.update).not.toHaveBeenCalled();
    expect(vi.mocked(provider.acknowledgePull).mock.calls[0]).toHaveLength(3);
    handle.stop();
  });

  it("keeps v3 providers on the legacy path without acknowledging even if they expose a callback", async () => {
    const { provider, todu, handle } = createAcknowledgedPull(3);
    await vi.advanceTimersByTimeAsync(0);
    expect(provider.pull).toHaveBeenCalledTimes(1);
    expect(provider.acknowledgePull).not.toHaveBeenCalled();
    expect(todu.instance.__internal.syncRuntime.flush).not.toHaveBeenCalled();
    expect(provider.push).toHaveBeenCalledTimes(1);
    handle.stop();
  });
});

describe("v5 field-group pulls", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("preserves unrelated fields and chooses different winners using the original local clock", async () => {
    const fixture = createFieldGroupPull({
      task: {
        title: "Local title",
        updatedAt: "2026-04-03T00:00:00Z",
        priority: "high",
        labels: ["b", "a"],
      },
    });
    vi.mocked(fixture.provider.pull).mockResolvedValue({
      tasks: [],
      checkpoint: fixture.checkpoint,
      taskUpdates: [
        {
          externalId: "remote-1",
          groups: {
            content: {
              base: { title: "Base", description: "" },
              remote: { title: "Remote title", description: "" },
              sourceTimestamp: "2026-04-02T00:00:00Z",
            },
            workflow: {
              base: { status: "active" },
              remote: { status: "done" },
              sourceTimestamp: "2026-04-01T00:00:00Z",
            },
            classification: {
              base: { priority: "high", labels: ["a", "b"] },
              remote: { priority: "high", labels: ["b", "a"] },
            },
          },
        },
      ],
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.todu.task.update).toHaveBeenCalledExactlyOnceWith(fixture.task.id, {
      status: "done",
      updatedAt: fixture.task.updatedAt,
    });
    expect(fixture.provider.acknowledgePull).toHaveBeenCalledWith(
      fixture.binding,
      fixture.checkpoint,
      expect.anything(),
      {
        taskResults: [
          expect.objectContaining({
            groups: {
              content: expect.objectContaining({
                winner: "local",
                resolution: "conflict",
                remoteWriteRequired: true,
              }),
              workflow: expect.objectContaining({
                winner: "remote",
                resolution: "remote-only",
                remoteWriteRequired: false,
              }),
              classification: expect.objectContaining({ winner: "equal", resolution: "unchanged" }),
            },
          }),
        ],
      },
    );
    expect(fixture.logger.warn).toHaveBeenCalledWith(
      "sync field-group conflict",
      expect.objectContaining({
        bindingId: fixture.binding.id,
        taskId: fixture.task.id,
        group: "content",
        winner: "local",
      }),
    );
    fixture.handle.stop();
  });

  it.each([
    "equal",
    "missing-remote",
    "missing-local",
  ])("selects remote and emits diagnostics for %s conflict clocks", async (clock) => {
    const fixture = createFieldGroupPull({
      task: {
        status: "waiting",
        updatedAt: clock === "missing-local" ? (undefined as never) : "2026-04-02T00:00:00Z",
      },
    });
    const sourceTimestamp = clock === "missing-remote" ? undefined : "2026-04-02T01:00:00+01:00";
    vi.mocked(fixture.provider.pull).mockResolvedValue({
      tasks: [],
      checkpoint: null,
      taskUpdates: [
        {
          externalId: "remote-1",
          groups: {
            workflow: {
              base: { status: "active" },
              remote: { status: "done" },
              ...(sourceTimestamp ? { sourceTimestamp } : {}),
            },
          },
        },
      ],
    });
    if (clock === "missing-local") fixture.task.updatedAt = undefined as never;
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.task.status).toBe("done");
    expect(fixture.logger.warn).toHaveBeenCalledWith(
      "sync field-group conflict",
      expect.objectContaining({
        winner: "remote",
        selection:
          clock === "equal" ? "remote-wins-equal-timestamps" : "remote-wins-missing-timestamp",
      }),
    );
    expect(fixture.provider.acknowledgePull).toHaveBeenCalledTimes(1);
    fixture.handle.stop();
  });

  it("does not rewrite converged values or approved descriptions", async () => {
    const fixture = createFieldGroupPull({
      task: { title: "Same" },
      description: "Same body",
      approval: { state: "approved" },
    });
    vi.mocked(fixture.provider.pull).mockResolvedValue({
      tasks: [],
      checkpoint: null,
      taskUpdates: [
        {
          externalId: "remote-1",
          groups: {
            content: {
              base: { title: "Base", description: "Base body" },
              remote: { title: "Same", description: "Same body" },
            },
          },
        },
      ],
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.todu.task.update).not.toHaveBeenCalled();
    expect(fixture.provider.acknowledgePull).toHaveBeenCalledWith(
      expect.anything(),
      null,
      expect.anything(),
      {
        taskResults: [
          expect.objectContaining({
            groups: {
              content: expect.objectContaining({ resolution: "converged", winner: "equal" }),
            },
          }),
        ],
      },
    );
    fixture.handle.stop();
  });

  it("applies a remote body with approval metadata and supports a deliberate clear", async () => {
    const fixture = createFieldGroupPull({ description: "Old body" });
    vi.mocked(fixture.provider.pull).mockResolvedValue({
      tasks: [],
      checkpoint: null,
      taskUpdates: [
        {
          externalId: "remote-1",
          groups: {
            content: {
              base: { title: "Task", description: "Old body" },
              remote: { title: "Task", description: "" },
            },
          },
        },
      ],
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.todu.task.update).toHaveBeenCalledWith(fixture.task.id, {
      description: "",
      descriptionApproval: { state: "pendingApproval", sourceBindingId: fixture.binding.id },
      updatedAt: fixture.task.updatedAt,
    });
    expect(fixture.provider.acknowledgePull).toHaveBeenCalledTimes(1);
    fixture.handle.stop();
  });

  it("acknowledges empty pulls only after flush and before push", async () => {
    const fixture = createFieldGroupPull();
    const saving = createDeferred<void>();
    vi.mocked(fixture.todu.instance.__internal.syncRuntime.flush).mockReturnValueOnce(
      saving.promise,
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.provider.acknowledgePull).not.toHaveBeenCalled();
    expect(fixture.provider.push).not.toHaveBeenCalled();
    saving.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.provider.acknowledgePull).toHaveBeenCalledWith(
      fixture.binding,
      fixture.checkpoint,
      expect.anything(),
      { taskResults: [] },
    );
    expect(vi.mocked(fixture.provider.acknowledgePull).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(fixture.provider.push).mock.invocationCallOrder[0],
    );
    fixture.handle.stop();
  });

  it.each([
    "partial-task",
    "flush",
    "recovery-read",
    "recovery-write",
    "detail-read",
    "mapping-save",
  ])("does not acknowledge or push after %s failure and retries fresh", async (phase) => {
    const fixture = createFieldGroupPull({ description: "Old body" });
    const update: SyncTaskFieldGroupUpdate = {
      externalId: "remote-1",
      groups: {
        content: {
          base: { title: "Task", description: "Old body" },
          remote: { title: "Remote", description: "New body" },
        },
        workflow: { base: { status: "active" }, remote: { status: "done" } },
      },
    };
    if (phase === "mapping-save")
      update.groups.assignment = {
        base: { assignees: [] },
        remote: { assignees: [{ externalAccountId: "42" }] },
      };
    vi.mocked(fixture.provider.pull).mockResolvedValue({
      tasks: [],
      taskUpdates: [update],
      checkpoint: fixture.checkpoint,
    });
    const failure = err(validationError("test", "application failed"));
    if (phase === "partial-task") {
      const applyFirst = fixture.todu.task.update.getMockImplementation()!;
      fixture.todu.task.update.mockImplementationOnce(applyFirst).mockResolvedValueOnce(failure);
    }
    if (phase === "flush")
      vi.mocked(fixture.todu.instance.__internal.syncRuntime.flush).mockRejectedValueOnce(
        new Error("flush failed"),
      );
    if (phase === "detail-read") fixture.todu.task.get.mockResolvedValueOnce(failure);
    if (phase === "mapping-save") fixture.todu.integration.update.mockResolvedValueOnce(failure);
    const store = fixture.todu.instance.__internal.syncRuntime.contentRecovery;
    if (phase === "recovery-read") vi.spyOn(store, "read").mockResolvedValueOnce(failure);
    if (phase === "recovery-write") vi.spyOn(store, "write").mockResolvedValueOnce(failure);
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.provider.acknowledgePull).not.toHaveBeenCalled();
    expect(fixture.provider.push).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(fixture.provider.acknowledgePull).toHaveBeenCalledTimes(1);
    const saved = await fixture.todu.instance.task.get(fixture.task.id);
    expect(saved.ok && saved.value).toMatchObject({
      title: "Remote",
      description: "New body",
      status: "done",
    });
    fixture.handle.stop();
  });

  it("guards v5 bootstrap detail repair against intervening local edits", async () => {
    const fixture = createFieldGroupPull({
      description: "Base body",
      task: { updatedAt: "2026-04-01T00:00:00.000Z" },
    });
    vi.mocked(fixture.provider.pull).mockResolvedValue({
      tasks: [
        {
          externalId: "remote-1",
          title: "Task",
          description: "Remote body",
          updatedAt: fixture.task.updatedAt,
        },
      ],
      taskUpdates: [],
      checkpoint: null,
    });
    const tools = fixture.todu.instance.__internal.syncRuntime.tasks;
    const original = vi.mocked(tools.updateIfCurrent).getMockImplementation()!;
    vi.mocked(tools.updateIfCurrent).mockImplementationOnce(async (params) => {
      await fixture.todu.instance.task.update(fixture.task.id, {
        title: "New local edit",
        updatedAt: "2026-04-04T00:00:00.000Z",
      });
      return original(params);
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.provider.acknowledgePull).not.toHaveBeenCalled();
    expect(await fixture.todu.instance.task.get(fixture.task.id)).toMatchObject({
      ok: true,
      value: {
        title: "New local edit",
        description: "Base body",
        updatedAt: "2026-04-04T00:00:00.000Z",
      },
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(fixture.provider.acknowledgePull).toHaveBeenCalledTimes(1);
    expect(await fixture.todu.instance.task.get(fixture.task.id)).toMatchObject({
      ok: true,
      value: {
        title: "New local edit",
        description: "Base body",
        updatedAt: "2026-04-04T00:00:00.000Z",
      },
    });
    fixture.handle.stop();
  });

  it("preserves the v5 task clock when saving transport links", async () => {
    const fixture = createFieldGroupPull();
    const clock = fixture.task.updatedAt;
    vi.mocked(fixture.provider.push).mockResolvedValue({
      taskLinks: [
        {
          localTaskId: fixture.task.id,
          externalId: "remote-1",
          sourceUrl: "https://example.test/task/1",
        },
      ],
      commentLinks: [],
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.task.sourceUrl).toBe("https://example.test/task/1");
    expect(fixture.task.updatedAt).toBe(clock);
    expect(
      fixture.todu.instance.__internal.syncRuntime.tasks.updateIfCurrent,
    ).toHaveBeenCalledTimes(1);
    fixture.handle.stop();
  });

  it("does not reset an intervening local clock while saving a v5 transport link", async () => {
    const fixture = createFieldGroupPull({ task: { updatedAt: "2026-04-01T00:00:00.000Z" } });
    vi.mocked(fixture.provider.push).mockResolvedValue({
      taskLinks: [
        {
          localTaskId: fixture.task.id,
          externalId: "remote-1",
          sourceUrl: "https://example.test/task/1",
        },
      ],
      commentLinks: [],
    });
    const tools = fixture.todu.instance.__internal.syncRuntime.tasks;
    const original = vi.mocked(tools.updateIfCurrent).getMockImplementation()!;
    vi.mocked(tools.updateIfCurrent).mockImplementationOnce(async (params) => {
      await fixture.todu.instance.task.update(fixture.task.id, {
        title: "New local edit",
        updatedAt: "2026-04-04T00:00:00.000Z",
      });
      return original(params);
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.provider.acknowledgePull).toHaveBeenCalledTimes(1);
    expect(fixture.task).toMatchObject({
      title: "New local edit",
      updatedAt: "2026-04-04T00:00:00.000Z",
    });
    expect(fixture.task.sourceUrl).toBeUndefined();
    expect(fixture.todu.integration.updateStatus).toHaveBeenLastCalledWith(
      fixture.binding.id,
      expect.objectContaining({ state: "error" }),
    );
    fixture.handle.stop();
  });

  it("rejects v5 transport links to tasks outside the binding project", async () => {
    const fixture = createFieldGroupPull();
    fixture.task.projectId = createProjectId("other-project");
    vi.mocked(fixture.provider.push).mockResolvedValue({
      taskLinks: [
        {
          localTaskId: fixture.task.id,
          externalId: "remote-1",
          sourceUrl: "https://example.test/task/1",
        },
      ],
      commentLinks: [],
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.todu.task.update).not.toHaveBeenCalled();
    expect(fixture.task.sourceUrl).toBeUndefined();
    expect(fixture.todu.integration.updateStatus).toHaveBeenLastCalledWith(
      fixture.binding.id,
      expect.objectContaining({ state: "error" }),
    );
    fixture.handle.stop();
  });

  it("does not acknowledge a partially applied multi-task batch and retains result ordering on replay", async () => {
    const fixture = createFieldGroupPull();
    const created = await fixture.todu.instance.task.create({
      projectId: fixture.project.id,
      title: "Second",
      externalId: "remote-2",
    });
    if (!created.ok) throw new Error("Expected second task");
    vi.mocked(fixture.provider.pull).mockResolvedValue({
      tasks: [],
      checkpoint: null,
      taskUpdates: ["remote-1", "remote-2"].map((externalId) => ({
        externalId,
        groups: { workflow: { base: { status: "active" }, remote: { status: "done" } } },
      })),
    });
    const applyFirst = fixture.todu.task.update.getMockImplementation()!;
    fixture.todu.task.update
      .mockImplementationOnce(applyFirst)
      .mockResolvedValueOnce(err(validationError("test", "second task failed")));
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.task.status).toBe("done");
    expect(fixture.provider.acknowledgePull).not.toHaveBeenCalled();
    expect(fixture.provider.push).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(
      vi
        .mocked(fixture.provider.acknowledgePull)
        .mock.calls[0][3].taskResults.map((result) => result.localTaskId),
    ).toEqual([fixture.task.id, created.value.id]);
    expect(
      vi
        .mocked(fixture.provider.acknowledgePull)
        .mock.calls[0][3].taskResults.map((result) => result.groups.workflow?.resolution),
    ).toEqual(["converged", "remote-only"]);
    fixture.handle.stop();
  });

  it("rechecks touched values after flush and does not acknowledge an intervening local edit", async () => {
    const fixture = createFieldGroupPull();
    vi.mocked(fixture.provider.pull).mockResolvedValue({
      tasks: [],
      checkpoint: null,
      taskUpdates: [
        {
          externalId: "remote-1",
          groups: { workflow: { base: { status: "active" }, remote: { status: "done" } } },
        },
      ],
    });
    vi.mocked(fixture.todu.instance.__internal.syncRuntime.flush).mockImplementationOnce(
      async () => {
        fixture.task.status = "waiting";
      },
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.provider.acknowledgePull).not.toHaveBeenCalled();
    expect(fixture.provider.push).not.toHaveBeenCalled();
    fixture.handle.stop();
  });

  it.each([
    "missing",
    "contradictory",
    "duplicate",
    "cross-array",
    "invalid",
    "noncanonical",
    "linked-bootstrap",
    "missing-updates",
  ])("rejects %s payloads before task application", async (problem) => {
    const fixture = createFieldGroupPull();
    const update: SyncTaskFieldGroupUpdate = {
      externalId: "remote-1",
      groups: { workflow: { base: { status: "active" }, remote: { status: "done" } } },
    };
    const tasks: ImportedTaskInput[] = [];
    if (problem === "missing") update.externalId = "unknown";
    if (problem === "contradictory") update.localTaskId = createTaskId("another-task");
    if (problem === "invalid") update.groups.workflow!.remote.status = "closed" as never;
    if (problem === "noncanonical")
      update.groups.content = {
        base: { title: "Task", description: "" },
        remote: { title: " Task ", description: "" },
      };
    if (problem === "cross-array" || problem === "linked-bootstrap")
      tasks.push({ externalId: "remote-1", title: "Remote", updatedAt: "2026-04-05T00:00:00Z" });
    vi.mocked(fixture.provider.pull).mockResolvedValue({
      tasks,
      checkpoint: null,
      taskUpdates:
        problem === "missing-updates"
          ? (undefined as never)
          : problem === "duplicate"
            ? [update, update]
            : problem === "linked-bootstrap"
              ? []
              : [update],
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.todu.task.update).not.toHaveBeenCalled();
    expect(fixture.todu.task.create).not.toHaveBeenCalled();
    expect(fixture.provider.acknowledgePull).not.toHaveBeenCalled();
    expect(fixture.provider.push).not.toHaveBeenCalled();
    fixture.handle.stop();
  });

  it("imports remote assignment, persists mappings and authorization, and allows an explicit clear", async () => {
    const fixture = createFieldGroupPull();
    vi.mocked(fixture.provider.pull).mockResolvedValue({
      tasks: [],
      checkpoint: null,
      taskUpdates: [
        {
          externalId: "remote-1",
          groups: {
            assignment: {
              base: { assignees: [] },
              remote: { assignees: [{ externalAccountId: "42" }] },
            },
          },
        },
      ],
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.task.assigneeActorIds).toHaveLength(1);
    expect(fixture.todu.project.update).toHaveBeenCalledTimes(1);
    expect(fixture.todu.integration.update).toHaveBeenCalledTimes(1);
    expect(fixture.provider.acknowledgePull).toHaveBeenCalledTimes(1);
    vi.mocked(fixture.provider.pull).mockResolvedValue({
      tasks: [],
      checkpoint: null,
      taskUpdates: [
        {
          externalId: "remote-1",
          groups: {
            assignment: {
              base: { assignees: [{ externalAccountId: "42" }] },
              remote: { assignees: [] },
            },
          },
        },
      ],
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(fixture.task.assigneeActorIds).toEqual([]);
    expect(fixture.provider.acknowledgePull).toHaveBeenCalledTimes(2);
    fixture.handle.stop();
  });

  it("compares known login aliases by stable identity and does not rewrite equivalent assignments", async () => {
    const id = createActorId("actor-user");
    const fixture = createFieldGroupPull({
      task: { assigneeActorIds: [id] },
      mappings: [{ actorId: id, externalLogin: "erik" }],
    });
    vi.mocked(fixture.provider.pull).mockResolvedValue({
      tasks: [],
      checkpoint: null,
      taskUpdates: [
        {
          externalId: "remote-1",
          groups: {
            assignment: {
              base: { assignees: [{ externalLogin: "ERIK" }] },
              remote: { assignees: [{ externalAccountId: "42", externalLogin: "erik" }] },
            },
          },
        },
      ],
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.todu.task.update).not.toHaveBeenCalled();
    expect(fixture.provider.acknowledgePull).toHaveBeenCalledTimes(1);
    expect(fixture.binding.options?.actorMappings?.[0].externalAccountId).toBe("42");
    fixture.handle.stop();
  });

  it("defers incomplete local mappings while still applying other groups", async () => {
    const fixture = createFieldGroupPull({
      task: { assigneeActorIds: [createActorId("actor-user")] },
    });
    vi.mocked(fixture.provider.pull).mockResolvedValue({
      tasks: [],
      checkpoint: null,
      taskUpdates: [
        {
          externalId: "remote-1",
          groups: {
            assignment: { base: { assignees: [] }, remote: { assignees: [] } },
            workflow: { base: { status: "active" }, remote: { status: "done" } },
          },
        },
      ],
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.task.assigneeActorIds).toEqual([createActorId("actor-user")]);
    expect(fixture.provider.acknowledgePull).toHaveBeenCalledWith(
      expect.anything(),
      null,
      expect.anything(),
      {
        taskResults: [
          expect.objectContaining({
            deferred: { assignment: "incomplete-assignment-mapping" },
            groups: { workflow: expect.anything() },
          }),
        ],
      },
    );
    fixture.handle.stop();
  });

  it("blocks ambiguous partial recovery after an intervening clock change instead of acknowledging stale content", async () => {
    const fixture = createFieldGroupPull({
      task: { title: "Remote", updatedAt: "2026-04-04T00:00:00Z" },
      description: "Base body",
    });
    await fixture.todu.instance.__internal.syncRuntime.contentRecovery.write(fixture.binding.id, [
      {
        localTaskId: fixture.task.id,
        externalId: "remote-1",
        localTimestamp: "2026-04-03T00:00:00Z",
        before: { title: "Task", description: "Base body" },
        after: { title: "Remote", description: "Remote body" },
        sourceTimestamp: "2026-04-01T00:00:00Z",
      },
    ]);
    vi.mocked(fixture.provider.pull).mockResolvedValue({
      tasks: [],
      checkpoint: null,
      taskUpdates: [
        {
          externalId: "remote-1",
          groups: {
            content: {
              base: { title: "Task", description: "Base body" },
              remote: { title: "Remote", description: "Remote body" },
            },
          },
        },
      ],
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.todu.task.update).not.toHaveBeenCalled();
    expect(fixture.provider.acknowledgePull).not.toHaveBeenCalled();
    expect(fixture.provider.push).not.toHaveBeenCalled();
    expect(fixture.todu.integration.updateStatus).toHaveBeenLastCalledWith(
      fixture.binding.id,
      expect.objectContaining({
        state: "error",
        lastErrorSummary: expect.stringContaining("ambiguous provenance"),
      }),
    );
    fixture.handle.stop();
  });

  it.each([
    ["active", "active", "unchanged", "equal"],
    ["waiting", "active", "local-only", "local"],
    ["active", "done", "remote-only", "remote"],
    ["done", "done", "converged", "equal"],
    ["waiting", "done", "conflict", "local"],
  ] as const)("reports the %s/%s workflow decision as %s", async (local, remote, resolution, winner) => {
    const fixture = createFieldGroupPull({
      task: { status: local, updatedAt: "2026-04-03T00:00:00Z" },
    });
    vi.mocked(fixture.provider.pull).mockResolvedValue({
      tasks: [],
      checkpoint: null,
      taskUpdates: [
        {
          externalId: "remote-1",
          groups: {
            workflow: {
              base: { status: "active" },
              remote: { status: remote },
              sourceTimestamp: "2026-04-01T00:00:00Z",
            },
          },
        },
      ],
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(
      vi.mocked(fixture.provider.acknowledgePull).mock.calls[0][3].taskResults[0].groups.workflow,
    ).toMatchObject({ resolution, winner });
    expect(fixture.todu.task.update).toHaveBeenCalledTimes(winner === "remote" ? 1 : 0);
    fixture.handle.stop();
  });

  it("updates only classification fields and exports fresh values", async () => {
    const fixture = createFieldGroupPull({
      task: { title: "Keep title", labels: ["old"] },
      description: "Keep body",
    });
    vi.mocked(fixture.provider.pull).mockResolvedValue({
      tasks: [],
      checkpoint: null,
      taskUpdates: [
        {
          externalId: "remote-1",
          groups: {
            classification: {
              base: { priority: "medium", labels: ["old"] },
              remote: { priority: "high", labels: ["new"] },
            },
          },
        },
      ],
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.todu.task.update).toHaveBeenCalledExactlyOnceWith(fixture.task.id, {
      priority: "high",
      labels: ["new"],
      updatedAt: fixture.task.updatedAt,
    });
    expect(fixture.provider.push).toHaveBeenCalledWith(
      expect.anything(),
      [
        expect.objectContaining({
          title: "Keep title",
          description: "Keep body",
          priority: "high",
          labels: ["new"],
        }),
      ],
      expect.anything(),
    );
    fixture.handle.stop();
  });

  it.each([
    "detail",
    "comments",
  ])("fails v5 push closed when fresh %s reads fail after acknowledgment", async (phase) => {
    const fixture = createFieldGroupPull();
    vi.mocked(fixture.provider.acknowledgePull).mockImplementationOnce(async () => {
      const failure = err(validationError("read", "unavailable"));
      if (phase === "detail") fixture.todu.task.get.mockResolvedValueOnce(failure);
      else fixture.todu.note.list.mockResolvedValueOnce(failure);
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.provider.acknowledgePull).toHaveBeenCalledTimes(1);
    expect(fixture.provider.push).not.toHaveBeenCalled();
    fixture.handle.stop();
  });

  it("skips push until acknowledgment succeeds and recomputes replay outcomes", async () => {
    const fixture = createFieldGroupPull();
    vi.mocked(fixture.provider.acknowledgePull).mockRejectedValueOnce(
      new Error("receipt save failed"),
    );
    vi.mocked(fixture.provider.pull).mockResolvedValue({
      tasks: [],
      checkpoint: fixture.checkpoint,
      taskUpdates: [
        {
          externalId: "remote-1",
          groups: { workflow: { base: { status: "active" }, remote: { status: "done" } } },
        },
      ],
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.provider.push).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(fixture.provider.acknowledgePull).toHaveBeenCalledTimes(2);
    expect(
      vi.mocked(fixture.provider.acknowledgePull).mock.calls[1][3].taskResults[0].groups.workflow
        ?.resolution,
    ).toBe("converged");
    expect(fixture.provider.push).toHaveBeenCalledTimes(1);
    fixture.handle.stop();
  });
});

function createFieldGroupPull(
  options: {
    task?: Partial<Task>;
    description?: string;
    approval?: ImportedContentApproval;
    mappings?: NonNullable<IntegrationBinding["options"]>["actorMappings"];
  } = {},
) {
  const project = createProject();
  const binding = createBinding(project.id, { options: { actorMappings: options.mappings ?? [] } });
  const task = createTask(project.id, { externalId: "remote-1", ...options.task });
  const todu = createTodu(project, [task], [binding]);
  const details = new Map<
    string,
    { description?: string; descriptionApproval?: ImportedContentApproval }
  >([[task.id, { description: options.description, descriptionApproval: options.approval }]]);
  const originalUpdate = todu.task.update.getMockImplementation() as (
    id: string,
    input: Partial<TaskWithDetail>,
  ) => ReturnType<ToduWithInternalTools["task"]["update"]>;
  todu.task.update.mockImplementation(async (id: string, input: Partial<TaskWithDetail>) => {
    const result = await originalUpdate(id, input);
    if (result.ok && result.value) {
      const detail = details.get(id) ?? {};
      if (input.description !== undefined) detail.description = input.description;
      if (input.descriptionApproval !== undefined)
        detail.descriptionApproval = input.descriptionApproval;
      details.set(id, detail);
      return ok({ ...result.value, ...detail });
    }
    return result;
  });
  todu.task.get.mockImplementation(async (id: string) => {
    const result = await todu.instance.task.list();
    const found = result.ok && result.value.find((row) => row.id === id);
    return found ? ok({ ...found, ...details.get(id) }) : err(validationError("id", "missing"));
  });
  todu.instance.__internal.syncRuntime.contentRecovery = createSyncContentRecoveryStore({
    storagePath: "unused",
    catalogId: "test",
    ephemeral: true,
  });
  todu.instance.__internal.syncRuntime.tasks = {
    updateIfCurrent: vi.fn(async ({ id, input, expected }) => {
      const current = await todu.instance.task.get(id);
      if (!current.ok) return current;
      if (JSON.stringify(current.value) !== JSON.stringify(expected))
        return err(
          validationError("syncPrecondition", "Task changed during sync; retry reconciliation"),
        );
      return todu.instance.task.update(id, { ...input, updatedAt: expected.updatedAt });
    }),
  };
  const checkpoint = { cursor: "opaque" };
  const provider: SyncProviderV5 = {
    ...createV3Provider(),
    pull: vi
      .fn<SyncProviderV5["pull"]>()
      .mockResolvedValue({ tasks: [], taskUpdates: [], checkpoint }),
    acknowledgePull: vi.fn<SyncProviderV5["acknowledgePull"]>().mockResolvedValue(undefined),
  };
  const logger = createLogger();
  const runtime = createSyncPluginWorkerRuntime({
    pluginName: "github",
    pluginVersion: "1.0.0",
    modulePath: "/plugins/github.js",
    authorityId: "test",
    provider,
    providerApiVersion: 5,
    getTodu: () => todu.instance,
    logger,
    config: { enabled: true, intervalMs: 1000, retryInitialMs: 100, retryMaxMs: 800, settings: {} },
  });
  return { task, todu, binding, project, provider, checkpoint, logger, handle: runtime.start() };
}

function createAcknowledgedPull(apiVersion = 4) {
  const project = createProject();
  const binding = createBinding(project.id);
  const task = createTask(project.id, { externalId: "remote-1" });
  const todu = createTodu(project, [task], [binding], {
    notes: [
      createNote({
        id: createNoteId("old-note"),
        content: "old",
        entityType: "task",
        entityId: task.id,
        tags: ["sync:externalId:old-comment"],
      }),
      createNote({
        id: createNoteId("deleted-note"),
        content: "deleted",
        entityType: "task",
        entityId: task.id,
        tags: ["sync:externalId:deleted-comment"],
      }),
    ],
  });
  const checkpoint = { issueCursor: "opaque", comments: [1, 2] };
  const provider: SyncProviderV4 = {
    ...createV3Provider(),
    pull: vi.fn<SyncProviderV4["pull"]>().mockResolvedValue({
      checkpoint,
      tasks: [
        { externalId: "remote-1", title: "updated", updatedAt: "2026-04-01T00:00:00.000Z" },
        {
          externalId: "remote-2",
          title: "new",
          updatedAt: "2026-04-01T00:00:00.000Z",
          assignees: [{ externalLogin: "octocat" }],
        },
      ],
      comments: [
        {
          externalId: "old-comment",
          externalTaskId: "remote-1",
          body: "updated",
          createdAt: "2026-04-01T00:00:00.000Z",
        },
        {
          externalId: "new-comment",
          externalTaskId: "remote-2",
          body: "new",
          createdAt: "2026-04-01T00:00:00.000Z",
        },
      ],
      deletedComments: [{ externalId: "deleted-comment", externalTaskId: "remote-1" }],
    }),
    acknowledgePull: vi.fn<SyncProviderV4["acknowledgePull"]>().mockResolvedValue(undefined),
  };
  const runtime = createSyncPluginWorkerRuntime({
    pluginName: "github",
    pluginVersion: "1.0.0",
    modulePath: "/plugins/github.js",
    authorityId: "daemon://test",
    provider,
    providerApiVersion: apiVersion,
    getTodu: () => todu.instance,
    logger: createLogger(),
    config: { enabled: true, intervalMs: 1000, retryInitialMs: 100, retryMaxMs: 800, settings: {} },
  });
  return { provider, todu, binding, project, checkpoint, handle: runtime.start() };
}

function createProvider(overrides: Partial<SyncProvider> = {}): SyncProvider {
  return {
    initialize: vi.fn<SyncProvider["initialize"]>().mockResolvedValue(undefined),
    pull: vi.fn<SyncProvider["pull"]>().mockResolvedValue({ tasks: [], comments: [] }),
    push: vi.fn<SyncProvider["push"]>().mockResolvedValue({ commentLinks: [], taskLinks: [] }),
    shutdown: vi.fn<SyncProvider["shutdown"]>().mockResolvedValue(undefined),
    name: "github",
    version: "1.0.0",
    ...overrides,
  };
}

function createV3Provider(overrides: Partial<SyncProviderV3> = {}): SyncProviderV3 {
  return {
    initialize: vi.fn<SyncProviderV3["initialize"]>().mockResolvedValue(undefined),
    pull: vi.fn<SyncProviderV3["pull"]>().mockResolvedValue({ tasks: [], comments: [] }),
    push: vi.fn<SyncProviderV3["push"]>().mockResolvedValue({ commentLinks: [], taskLinks: [] }),
    shutdown: vi.fn<SyncProviderV3["shutdown"]>().mockResolvedValue(undefined),
    name: "github",
    version: "1.0.0",
    ...overrides,
  };
}

function createProject(): Project {
  const now = new Date(0).toISOString();

  return {
    id: createProjectId("proj-1"),
    name: "Project",
    status: "active",
    priority: "medium",
    authorizedAssigneeActorIds: [createActorId("actor-user")],
    createdAt: now,
    updatedAt: now,
  };
}

function createTask(projectId: Project["id"], overrides: Partial<Task> = {}): Task {
  const now = new Date(0).toISOString();

  return {
    id: overrides.id ?? createTaskId("task-1"),
    title: overrides.title ?? "Task",
    status: overrides.status ?? "active",
    priority: overrides.priority ?? "medium",
    projectId,
    labels: overrides.labels ?? [],
    assigneeActorIds: overrides.assigneeActorIds ?? [],
    assignees: overrides.assignees ?? [],
    externalId: overrides.externalId,
    sourceUrl: overrides.sourceUrl,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

function createBinding(
  projectId: Project["id"],
  overrides: Partial<IntegrationBinding> = {},
): IntegrationBinding {
  const now = new Date(0).toISOString();

  return {
    id: createIntegrationBindingId(overrides.id ?? "ibind-1"),
    provider: overrides.provider ?? "github",
    projectId,
    targetKind: overrides.targetKind ?? "repository",
    targetRef: overrides.targetRef ?? "owner/repo",
    strategy: overrides.strategy ?? "bidirectional",
    enabled: overrides.enabled ?? true,
    options: overrides.options,
    createdAt: now,
    updatedAt: now,
  };
}

function createNote(overrides: Partial<Note> & { content: string }): Note {
  const now = new Date(0).toISOString();

  return {
    id: createNoteId(overrides.id ?? `note-${Math.random().toString(36).slice(2, 8)}`),
    content: overrides.content,
    author: overrides.author ?? "user",
    authorActorId: overrides.authorActorId,
    contentApproval: overrides.contentApproval,
    entityType: overrides.entityType,
    entityId: overrides.entityId,
    tags: overrides.tags ?? [],
    createdAt: overrides.createdAt ?? now,
  };
}

interface CreateToduOptions {
  notes?: Note[];
  actors?: Actor[];
  commentProvenance?: CommentSyncProvenance[];
}

function createTodu(
  project: Project,
  initialTasks: Task[],
  bindings: IntegrationBinding[],
  options: CreateToduOptions = {},
): {
  instance: ToduWithInternalTools;
  integration: {
    list: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateStatus: ReturnType<typeof vi.fn>;
  };
  project: {
    get: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  task: {
    list: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  note: {
    list: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  actors: Actor[];
} {
  const tasks: Task[] = [...initialTasks];
  const notes: Note[] = [...(options.notes ?? [])];
  const commentProvenance: CommentSyncProvenance[] = [...(options.commentProvenance ?? [])];
  const actors: Actor[] = [{ id: createActorId("actor-user"), displayName: "user" }];
  for (const actor of options.actors ?? []) {
    if (!actors.some((candidate) => candidate.id === actor.id)) {
      actors.push(actor);
    }
  }

  const statuses = new Map<string, IntegrationBindingStatus>();
  const integrationList = vi.fn(async (filter?: { provider?: string; enabled?: boolean }) => {
    let filtered = bindings;

    if (filter?.provider !== undefined) {
      filtered = filtered.filter((binding) => binding.provider === filter.provider);
    }
    if (filter?.enabled !== undefined) {
      filtered = filtered.filter((binding) => binding.enabled === filter.enabled);
    }

    return ok(filtered);
  });

  const integrationUpdate = vi.fn(
    async (id: string, input: { options?: IntegrationBinding["options"] }) => {
      const binding = bindings.find((candidate) => candidate.id === id);
      if (!binding) return ok(undefined);
      if (input.options !== undefined) {
        binding.options = input.options;
      }
      binding.updatedAt = new Date(0).toISOString();
      return ok({ ...binding });
    },
  );

  const updateStatus = vi.fn(
    async (
      id: string,
      input: {
        state?: IntegrationBindingStatus["state"];
        authorityId?: string | null;
        lastAttemptedSyncAt?: string | null;
        lastSuccessfulSyncAt?: string | null;
        lastErrorSummary?: string | null;
      },
    ) => {
      const previous =
        statuses.get(id) ??
        ({
          bindingId: createIntegrationBindingId(id),
          state: "idle",
          authorityId: null,
          lastAttemptedSyncAt: null,
          lastSuccessfulSyncAt: null,
          lastErrorSummary: null,
          updatedAt: new Date(0).toISOString(),
        } satisfies IntegrationBindingStatus);

      const next: IntegrationBindingStatus = {
        bindingId: previous.bindingId,
        state: input.state ?? previous.state,
        authorityId: input.authorityId ?? previous.authorityId,
        lastAttemptedSyncAt:
          input.lastAttemptedSyncAt !== undefined
            ? input.lastAttemptedSyncAt
            : previous.lastAttemptedSyncAt,
        lastSuccessfulSyncAt:
          input.lastSuccessfulSyncAt !== undefined
            ? input.lastSuccessfulSyncAt
            : previous.lastSuccessfulSyncAt,
        lastErrorSummary:
          input.lastErrorSummary !== undefined ? input.lastErrorSummary : previous.lastErrorSummary,
        updatedAt: new Date(0).toISOString(),
      };

      statuses.set(id, next);
      return ok(next);
    },
  );

  const projectGet = vi.fn().mockImplementation(async (id: string) => {
    if (project.id !== id) return ok(undefined);
    return ok({ ...project, authorizedAssigneeActorIds: [...project.authorizedAssigneeActorIds] });
  });

  const projectUpdate = vi.fn().mockImplementation(
    async (
      id: string,
      input: {
        authorizedAssigneeActorIds?: Project["authorizedAssigneeActorIds"];
      },
    ) => {
      if (project.id !== id) return ok(undefined);
      if (input.authorizedAssigneeActorIds !== undefined) {
        project.authorizedAssigneeActorIds = [...input.authorizedAssigneeActorIds];
      }
      return ok({
        ...project,
        authorizedAssigneeActorIds: [...project.authorizedAssigneeActorIds],
      });
    },
  );

  const taskList = vi.fn().mockImplementation(async (filter?: { projectId?: string }) => {
    if (!filter?.projectId) {
      return ok([...tasks]);
    }

    return ok(tasks.filter((task) => task.projectId === filter.projectId));
  });

  const taskGet = vi.fn().mockImplementation(async (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return ok({ id, description: undefined });
    return ok({ ...task, description: undefined });
  });

  const taskCreate = vi
    .fn()
    .mockImplementation(
      async (input: {
        title: string;
        projectId: string;
        status?: Task["status"];
        priority?: Task["priority"];
        description?: string;
        descriptionApproval?: unknown;
        labels?: string[];
        assigneeActorIds?: Task["assigneeActorIds"];
        assignees?: string[];
        externalId?: string;
        sourceUrl?: string;
        createdAt?: string;
        updatedAt?: string;
      }) => {
        const createdTask: Task = {
          id: createTaskId(`task-created-${tasks.length + 1}`),
          title: input.title,
          status: input.status ?? "active",
          priority: input.priority ?? "medium",
          projectId: input.projectId as Project["id"],
          labels: input.labels ?? [],
          assigneeActorIds: input.assigneeActorIds ?? [],
          assignees: input.assignees ?? [],
          createdAt: input.createdAt ?? new Date(0).toISOString(),
          updatedAt: input.updatedAt ?? input.createdAt ?? new Date(0).toISOString(),
        };
        if (input.externalId !== undefined) createdTask.externalId = input.externalId;
        if (input.sourceUrl !== undefined) createdTask.sourceUrl = input.sourceUrl;
        tasks.push(createdTask);
        return ok({ ...createdTask, description: input.description });
      },
    );

  const taskUpdate = vi.fn().mockImplementation(
    async (
      id: string,
      input: {
        title?: string;
        status?: Task["status"];
        priority?: Task["priority"];
        description?: string;
        descriptionApproval?: unknown;
        labels?: string[];
        assigneeActorIds?: Task["assigneeActorIds"];
        assignees?: string[];
        externalId?: string;
        sourceUrl?: string;
        updatedAt?: string;
      },
    ) => {
      const task = tasks.find((candidate) => candidate.id === id);
      if (!task) return ok(undefined);
      if (input.title !== undefined) task.title = input.title;
      if (input.status !== undefined) task.status = input.status;
      if (input.priority !== undefined) task.priority = input.priority;
      if (input.labels !== undefined) task.labels = [...input.labels];
      if (input.assigneeActorIds !== undefined) task.assigneeActorIds = [...input.assigneeActorIds];
      if (input.assignees !== undefined) task.assignees = [...input.assignees];
      if (input.externalId !== undefined) task.externalId = input.externalId;
      if (input.sourceUrl !== undefined) task.sourceUrl = input.sourceUrl;
      task.updatedAt = input.updatedAt ?? new Date(0).toISOString();
      return ok({ ...task, description: input.description });
    },
  );

  let noteIdCounter = 1;
  const noteList = vi.fn(
    async (filter?: { entityType?: string; entityId?: string; tag?: string }) => {
      let filtered = notes;
      if (filter?.entityType) {
        filtered = filtered.filter((n) => n.entityType === filter.entityType);
      }
      if (filter?.entityId) {
        filtered = filtered.filter((n) => n.entityId === filter.entityId);
      }
      if (filter?.tag) {
        filtered = filtered.filter((n) => n.tags.includes(filter.tag));
      }
      return ok(filtered);
    },
  );

  const noteGet = vi.fn().mockImplementation(async (id: string) => {
    const note = notes.find((candidate) => candidate.id === id);
    if (!note) return ok(undefined);
    return ok({ ...note, tags: [...note.tags] });
  });

  const noteCreate = vi
    .fn()
    .mockImplementation(
      async (input: {
        content: string;
        author?: string;
        authorActorId?: Note["authorActorId"];
        contentApproval?: Note["contentApproval"];
        entityType?: string;
        entityId?: string;
        tags?: string[];
        createdAt?: string;
      }) => {
        const note: Note = {
          id: createNoteId(`note-${String(noteIdCounter++).padStart(3, "0")}`),
          content: input.content,
          author: input.author ?? "user",
          authorActorId: input.authorActorId,
          contentApproval: input.contentApproval,
          entityType: input.entityType as Note["entityType"],
          entityId: input.entityId,
          tags: input.tags ?? [],
          createdAt: input.createdAt ?? new Date(0).toISOString(),
        };
        notes.push(note);
        return ok(note);
      },
    );

  const noteUpdate = vi.fn().mockImplementation(
    async (
      id: string,
      input: {
        content?: string;
        tags?: string[];
        authorActorId?: Note["authorActorId"];
        contentApproval?: Note["contentApproval"];
      },
    ) => {
      const note = notes.find((n) => n.id === id);
      if (!note) return ok(undefined);
      if (input.content !== undefined) note.content = input.content;
      if (input.tags !== undefined) note.tags = input.tags;
      if (input.authorActorId !== undefined) note.authorActorId = input.authorActorId;
      if (input.contentApproval !== undefined) note.contentApproval = input.contentApproval;
      return ok(note);
    },
  );

  const noteDelete = vi.fn(async (id: string) => {
    const index = notes.findIndex((n) => n.id === id);
    if (index !== -1) notes.splice(index, 1);
    return ok(undefined);
  });

  const commentProvenanceList = vi.fn(
    async (filter?: {
      bindingId?: string;
      localNoteId?: string;
      externalTaskId?: string;
      externalCommentId?: string;
    }) => {
      let filtered = commentProvenance;
      if (filter?.bindingId !== undefined) {
        filtered = filtered.filter((record) => record.bindingId === filter.bindingId);
      }
      if (filter?.localNoteId !== undefined) {
        filtered = filtered.filter((record) => record.localNoteId === filter.localNoteId);
      }
      if (filter?.externalTaskId !== undefined) {
        filtered = filtered.filter((record) => record.externalTaskId === filter.externalTaskId);
      }
      if (filter?.externalCommentId !== undefined) {
        filtered = filtered.filter(
          (record) => record.externalCommentId === filter.externalCommentId,
        );
      }
      return ok(filtered.map((record) => ({ ...record })));
    },
  );

  const commentProvenanceUpsert = vi.fn(
    async (input: {
      bindingId: IntegrationBinding["id"];
      provider: string;
      targetKind: string;
      targetRef: string;
      localNoteId: Note["id"];
      externalTaskId: string;
      externalCommentId: string;
      sourceUrl?: string;
      lastMirroredAt: string;
    }) => {
      const existing = commentProvenance.find(
        (record) =>
          record.bindingId === input.bindingId && record.localNoteId === input.localNoteId,
      );
      if (existing) {
        existing.provider = input.provider;
        existing.targetKind = input.targetKind;
        existing.targetRef = input.targetRef;
        existing.externalTaskId = input.externalTaskId;
        existing.externalCommentId = input.externalCommentId;
        if (input.sourceUrl !== undefined) existing.sourceUrl = input.sourceUrl;
        existing.lastMirroredAt = input.lastMirroredAt;
        existing.updatedAt = new Date(0).toISOString();
        return ok({ ...existing });
      }
      const created: CommentSyncProvenance = {
        id: createCommentSyncProvenanceId(`cprov-${commentProvenance.length + 1}`),
        bindingId: input.bindingId,
        provider: input.provider,
        targetKind: input.targetKind,
        targetRef: input.targetRef,
        localNoteId: input.localNoteId,
        externalTaskId: input.externalTaskId,
        externalCommentId: input.externalCommentId,
        ...(input.sourceUrl !== undefined ? { sourceUrl: input.sourceUrl } : {}),
        lastMirroredAt: input.lastMirroredAt,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      };
      commentProvenance.push(created);
      return ok({ ...created });
    },
  );

  const commentProvenanceDeleteForNote = vi.fn(async (noteId: Note["id"]) => {
    for (let index = commentProvenance.length - 1; index >= 0; index -= 1) {
      if (commentProvenance[index].localNoteId === noteId) {
        commentProvenance.splice(index, 1);
      }
    }
    return ok(undefined);
  });

  const actorList = vi.fn().mockImplementation(async () => ok([...actors]));
  const actorEnsure = vi
    .fn()
    .mockImplementation(async (input: { id: Actor["id"]; displayName: string }) => {
      const existing = actors.find((actor) => actor.id === input.id);
      if (existing) return ok(existing);
      const created: Actor = { id: input.id, displayName: input.displayName };
      actors.push(created);
      return ok(created);
    });

  return {
    instance: {
      __internal: {
        syncRuntime: {
          actors: {
            list: actorList,
            getOwnerActorId: vi
              .fn()
              .mockImplementation(async () => ok(createActorId("actor-user"))),
            ensure: actorEnsure,
          },
          flush: vi.fn().mockResolvedValue(undefined),
          notes: {
            createWithId: vi.fn(
              async (
                id: Note["id"],
                input: Parameters<ToduWithInternalTools["note"]["create"]>[0],
              ) => {
                const existing = notes.find((note) => note.id === id);
                if (existing) return ok(existing);
                const result = await noteCreate(input);
                if (result.ok) result.value.id = id;
                return result;
              },
            ),
          },
          commentProvenance: {
            list: commentProvenanceList,
            upsert: commentProvenanceUpsert,
            deleteForNote: commentProvenanceDeleteForNote,
          },
        },
      },
      project: {
        get: projectGet,
        update: projectUpdate,
      },
      task: {
        list: taskList,
        get: taskGet,
        create: taskCreate,
        update: taskUpdate,
      },
      integration: {
        list: integrationList,
        update: integrationUpdate,
        updateStatus,
      },
      note: {
        list: noteList,
        get: noteGet,
        create: noteCreate,
        update: noteUpdate,
        delete: noteDelete,
      },
    } as unknown as ToduWithInternalTools,
    integration: {
      list: integrationList,
      update: integrationUpdate,
      updateStatus,
    },
    project: {
      get: projectGet,
      update: projectUpdate,
    },
    task: {
      list: taskList,
      get: taskGet,
      create: taskCreate,
      update: taskUpdate,
    },
    note: {
      list: noteList,
      get: noteGet,
      create: noteCreate,
      update: noteUpdate,
      delete: noteDelete,
    },
    actors,
  };
}

function createLogger(): DaemonLogger {
  const logger: DaemonLogger = {
    level: "debug",
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };

  (logger.child as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => logger);

  return logger;
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve: (value: T | PromiseLike<T>) => void = () => {};
  let reject: (reason?: unknown) => void = () => {};

  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return {
    promise,
    resolve,
    reject,
  };
}
