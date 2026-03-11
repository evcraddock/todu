import {
  createIntegrationBindingId,
  createNoteId,
  createProjectId,
  createTaskId,
  type ExternalComment,
  type ExternalTask,
  type IntegrationBinding,
  type IntegrationBindingStatus,
  type Note,
  ok,
  type Project,
  type SyncProvider,
  type Task,
} from "@todu/core";
import type { Todu } from "@todu/engine";
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
    const task = createTask(project.id);
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
              externalTaskId: task.id,
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
    expect(todu.note.update).toHaveBeenNthCalledWith(2, localNote.id, {
      content: "remote edit",
    });

    handle.stop();
  });

  it("linked local-origin comments later delete remotely through the same local note", async () => {
    const project = createProject();
    const task = createTask(project.id);
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
              externalTaskId: task.id,
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
    expect(provider.mapToTask).toHaveBeenCalledWith(pulledTasks[0], project);
    expect(todu.task.create).toHaveBeenCalledTimes(1);
    expect(todu.task.create).toHaveBeenCalledWith({
      title: "Pulled bug",
      projectId: project.id,
      status: "waiting",
      priority: "high",
      description: "Imported from GitHub",
      labels: ["bug"],
      assignees: ["octocat"],
      externalId: "gh-101",
      sourceUrl: "https://example.com/issues/101",
    });

    handle.stop();
  });

  it("pull updates existing tasks when external updatedAt is newer", async () => {
    const project = createProject();
    const existingTask = {
      ...createTask(project.id),
      externalId: "gh-101",
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
    expect(todu.task.update).toHaveBeenCalledWith(existingTask.id, {
      title: "Updated pulled bug",
      status: "inprogress",
      priority: "high",
      description: "Updated from GitHub",
      labels: ["bug", "synced"],
      assignees: ["octocat"],
      externalId: "gh-101",
      sourceUrl: "https://example.com/issues/101",
    });

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

  it("pull creates new comments as notes when externalId is not present locally", async () => {
    const project = createProject();
    const task = createTask(project.id);
    const binding = createBinding(project.id, { strategy: "pull" });
    const pulledComments: ExternalComment[] = [
      {
        externalId: "gh-comment-1",
        externalTaskId: task.id,
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
    expect(todu.note.create).toHaveBeenCalledWith({
      content: "New comment from GitHub",
      author: "octocat",
      entityType: "task",
      entityId: task.id,
      tags: ["sync:externalId:gh-comment-1"],
    });

    handle.stop();
  });

  it("pull updates existing comments when external updatedAt is newer", async () => {
    const project = createProject();
    const task = createTask(project.id);
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
        externalTaskId: task.id,
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
    expect(todu.note.update).toHaveBeenCalledWith(existingNote.id, {
      content: "Updated content from GitHub",
    });

    handle.stop();
  });

  it("pull deletes local synced notes absent from pull result", async () => {
    const project = createProject();
    const task = createTask(project.id);
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
            externalTaskId: task.id,
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
    const task = createTask(project.id);
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
        externalTaskId: task.id,
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

function createProject(): Project {
  const now = new Date(0).toISOString();

  return {
    id: createProjectId("proj-1"),
    name: "Project",
    status: "active",
    priority: "medium",
    createdAt: now,
    updatedAt: now,
  };
}

function createTask(projectId: Project["id"]): Task {
  const now = new Date(0).toISOString();

  return {
    id: createTaskId("task-1"),
    title: "Task",
    status: "active",
    priority: "medium",
    projectId,
    labels: [],
    assignees: [],
    createdAt: now,
    updatedAt: now,
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
    entityType: overrides.entityType,
    entityId: overrides.entityId,
    tags: overrides.tags ?? [],
    createdAt: overrides.createdAt ?? now,
  };
}

interface CreateToduOptions {
  notes?: Note[];
}

function createTodu(
  project: Project,
  initialTasks: Task[],
  bindings: IntegrationBinding[],
  options: CreateToduOptions = {},
): {
  instance: Todu;
  integration: {
    list: ReturnType<typeof vi.fn>;
    updateStatus: ReturnType<typeof vi.fn>;
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
} {
  const tasks: Task[] = [...initialTasks];
  const notes: Note[] = [...(options.notes ?? [])];
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
        labels?: string[];
        assignees?: string[];
        externalId?: string;
        sourceUrl?: string;
      }) => {
        const createdTask: Task = {
          id: createTaskId(`task-created-${tasks.length + 1}`),
          title: input.title,
          status: input.status ?? "active",
          priority: input.priority ?? "medium",
          projectId: input.projectId as Project["id"],
          labels: input.labels ?? [],
          assignees: input.assignees ?? [],
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString(),
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
        labels?: string[];
        assignees?: string[];
        externalId?: string;
        sourceUrl?: string;
      },
    ) => {
      const task = tasks.find((candidate) => candidate.id === id);
      if (!task) return ok(undefined);
      if (input.title !== undefined) task.title = input.title;
      if (input.status !== undefined) task.status = input.status;
      if (input.priority !== undefined) task.priority = input.priority;
      if (input.labels !== undefined) task.labels = [...input.labels];
      if (input.assignees !== undefined) task.assignees = [...input.assignees];
      if (input.externalId !== undefined) task.externalId = input.externalId;
      if (input.sourceUrl !== undefined) task.sourceUrl = input.sourceUrl;
      task.updatedAt = new Date(0).toISOString();
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
        const tag = filter.tag;
        filtered = filtered.filter((n) => n.tags.includes(tag));
      }
      return ok(filtered);
    },
  );

  const noteCreate = vi.fn(
    async (input: {
      content: string;
      author?: string;
      entityType?: string;
      entityId?: string;
      tags?: string[];
    }) => {
      const note: Note = {
        id: createNoteId(`note-${String(noteIdCounter++).padStart(3, "0")}`),
        content: input.content,
        author: input.author ?? "user",
        entityType: input.entityType as Note["entityType"],
        entityId: input.entityId,
        tags: input.tags ?? [],
        createdAt: new Date(0).toISOString(),
      };
      notes.push(note);
      return ok(note);
    },
  );

  const noteUpdate = vi.fn(async (id: string, input: { content?: string; tags?: string[] }) => {
    const note = notes.find((n) => n.id === id);
    if (!note) return ok(undefined);
    if (input.content !== undefined) note.content = input.content;
    if (input.tags !== undefined) note.tags = input.tags;
    return ok(note);
  });

  const noteDelete = vi.fn(async (id: string) => {
    const index = notes.findIndex((n) => n.id === id);
    if (index !== -1) notes.splice(index, 1);
    return ok(undefined);
  });

  return {
    instance: {
      project: {
        get: vi.fn().mockResolvedValue(ok(project)),
      },
      task: {
        list: taskList,
        get: taskGet,
        create: taskCreate,
        update: taskUpdate,
      },
      integration: {
        list: integrationList,
        updateStatus,
      },
      note: {
        list: noteList,
        create: noteCreate,
        update: noteUpdate,
        delete: noteDelete,
      },
    } as unknown as Todu,
    integration: {
      list: integrationList,
      updateStatus,
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
