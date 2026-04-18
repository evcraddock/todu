import {
  type Actor,
  createActorId,
  createIntegrationBindingId,
  createNoteId,
  createProjectId,
  createTaskId,
  type ExternalComment,
  type ExternalTask,
  type ImportedCommentInput,
  type ImportedTaskInput,
  type IntegrationBinding,
  type IntegrationBindingStatus,
  type Note,
  ok,
  type Project,
  type SyncProvider,
  type SyncProviderV3,
  type Task,
} from "@todu/core";
import type { ToduWithInternalTools } from "@todu/engine";
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
      [{ ...task, description: undefined, comments: [] }],
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

  it("push includes task comments from note.list in each TaskPushPayload", async () => {
    const provider = createProvider();
    const project = createProject();
    const task = createTask(project.id);
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
    expect(pushedTasks[0].comments).toEqual([taskNote]);

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
      mapToTask: vi
        .fn<SyncProvider["mapToTask"]>()
        .mockImplementation((external, activeProject) => ({
          id: task.id,
          title: external.title,
          status: "active",
          priority: "medium",
          projectId: activeProject.id,
          labels: [],
          assignees: [],
          externalId: external.externalId,
          sourceUrl: external.sourceUrl,
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString(),
        })),
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

  it("linked local-origin comments later delete remotely through the same local note", async () => {
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
              externalId: "gh-comment-other",
              externalTaskId: task.externalId!,
              body: "other remote comment",
              createdAt: "2026-03-10T10:00:00Z",
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
    const pulledTasks: ExternalTask[] = [
      {
        externalId: "gh-101",
        title: "Pulled bug",
        description: "Imported from GitHub",
        sourceUrl: "https://example.com/issues/101",
        createdAt: "2021-04-17T14:30:00Z",
        updatedAt: "2026-03-10T15:00:00Z",
      },
    ];
    const provider = createProvider({
      pull: vi.fn<SyncProvider["pull"]>().mockResolvedValue({
        tasks: pulledTasks,
      }),
      mapToTask: vi
        .fn<SyncProvider["mapToTask"]>()
        .mockImplementation((external, activeProject) => ({
          id: createTaskId(`task-${external.externalId}`),
          title: external.title,
          status: "waiting",
          priority: "high",
          projectId: activeProject.id,
          labels: ["bug"],
          assignees: ["octocat"],
          sourceUrl: external.sourceUrl,
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString(),
        })),
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

    expect(provider.mapToTask).toHaveBeenCalledTimes(1);
    expect(provider.mapToTask).toHaveBeenCalledWith(
      pulledTasks[0],
      expect.objectContaining({ id: project.id }),
    );
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
    const pulledTasks: ExternalTask[] = [
      {
        externalId: "gh-101",
        title: "Updated pulled bug",
        description: "Updated from GitHub",
        sourceUrl: "https://example.com/issues/101",
        updatedAt: "2026-03-10T15:00:00Z",
      },
    ];
    const provider = createProvider({
      pull: vi.fn<SyncProvider["pull"]>().mockResolvedValue({
        tasks: pulledTasks,
      }),
      mapToTask: vi
        .fn<SyncProvider["mapToTask"]>()
        .mockImplementation((external, activeProject) => ({
          id: existingTask.id,
          title: external.title,
          status: "inprogress",
          priority: "high",
          projectId: activeProject.id,
          labels: ["bug", "synced"],
          assignees: ["octocat"],
          sourceUrl: external.sourceUrl,
          createdAt: existingTask.createdAt,
          updatedAt: external.updatedAt ?? existingTask.updatedAt,
        })),
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
    const pulledTasks: ExternalTask[] = [
      {
        externalId: "gh-101",
        title: "Pulled bug",
        description: "Imported from GitHub",
        createdAt: "2021-04-17T14:30:00Z",
      },
    ];
    const provider = createProvider({
      pull: vi.fn<SyncProvider["pull"]>().mockResolvedValue({
        tasks: pulledTasks,
      }),
      mapToTask: vi
        .fn<SyncProvider["mapToTask"]>()
        .mockImplementation((external, activeProject) => ({
          id: createTaskId(`task-${external.externalId}`),
          title: external.title,
          status: "waiting",
          priority: "high",
          projectId: activeProject.id,
          labels: ["bug"],
          assignees: ["octocat"],
          sourceUrl: external.sourceUrl,
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString(),
        })),
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
    const pulledTasks: ExternalTask[] = [
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

    expect(provider.mapToTask).toHaveBeenCalledTimes(1);
    expect(todu.task.update).not.toHaveBeenCalled();
    expect(todu.task.create).not.toHaveBeenCalled();

    handle.stop();
  });

  it("pull fails safely when a pulled task timestamp is invalid", async () => {
    const project = createProject();
    const binding = createBinding(project.id, { strategy: "pull" });
    const pulledTasks: ExternalTask[] = [
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
    const pulledComments: ExternalComment[] = [
      {
        externalId: "gh-comment-1",
        externalTaskId: task.externalId!,
        body: "New comment from GitHub",
        author: "octocat",
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
        tags: ["sync:externalId:gh-comment-1"],
        createdAt: "2026-03-10T10:00:00.000Z",
      }),
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
    const pulledComments: ExternalComment[] = [
      {
        externalId: "gh-comment-1",
        externalTaskId: task.externalId!,
        body: "Updated content from GitHub",
        author: "octocat",
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

  it("pull deletes local synced notes absent from pull result", async () => {
    const project = createProject();
    const task = createTask(project.id, { externalId: "gh-task-1" });
    const binding = createBinding(project.id, { strategy: "pull" });
    const orphanedNote = createNote({
      entityType: "task",
      entityId: task.id,
      content: "will be deleted",
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
      }),
    });
    const todu = createTodu(project, [task], [binding], { notes: [orphanedNote] });

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
    expect(todu.note.delete).toHaveBeenCalledWith(orphanedNote.id);
    // The new comment should be created
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
    const pulledComments: ExternalComment[] = [
      {
        externalId: "gh-comment-1",
        externalTaskId: task.externalId!,
        body: "Older external content",
        author: "octocat",
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
            author: "octocat",
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
            author: "octocat",
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
            author: "octocat",
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
            author: "octocat",
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

  it("reuses trusted actor mappings during v2 pull and skips approval for mapped note authors", async () => {
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
            createdAt: "2026-01-01T00:00:00Z",
          },
        ],
        comments: [
          {
            externalId: "gh-comment-1",
            externalTaskId: task.externalId!,
            body: "Trusted comment",
            author: "octocat",
            createdAt: "2026-01-01T00:00:00Z",
          },
        ],
      }),
      mapToTask: vi.fn<SyncProvider["mapToTask"]>().mockReturnValue({
        id: createTaskId("task-gh-101"),
        title: "Pulled bug",
        status: "active",
        priority: "medium",
        projectId: project.id,
        labels: [],
        assigneeActorIds: [],
        assignees: ["octocat"],
        externalId: "gh-101",
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
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

function createProvider(overrides: Partial<SyncProvider> = {}): SyncProvider {
  return {
    initialize: vi.fn<SyncProvider["initialize"]>().mockResolvedValue(undefined),
    pull: vi.fn<SyncProvider["pull"]>().mockResolvedValue({ tasks: [] }),
    push: vi.fn<SyncProvider["push"]>().mockResolvedValue({ commentLinks: [], taskLinks: [] }),
    shutdown: vi.fn<SyncProvider["shutdown"]>().mockResolvedValue(undefined),
    mapToTask: vi.fn<SyncProvider["mapToTask"]>().mockImplementation((item) => ({
      id: createTaskId(String(item.externalId)),
      title: item.title,
      status: "active",
      priority: "medium",
      projectId: createProject().id,
      labels: [],
      assigneeActorIds: [],
      assignees: [],
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    })),
    mapFromTask: vi.fn<SyncProvider["mapFromTask"]>().mockImplementation((task) => ({
      externalId: task.id,
      title: task.title,
    })),
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
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  actors: Actor[];
} {
  const tasks: Task[] = [...initialTasks];
  const notes: Note[] = [...(options.notes ?? [])];
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
