import {
  createIntegrationBindingId,
  createProjectId,
  createTaskId,
  type IntegrationBinding,
  type IntegrationBindingStatus,
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
      [{ ...task, description: undefined }],
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
});

function createProvider(overrides: Partial<SyncProvider> = {}): SyncProvider {
  return {
    initialize: vi.fn<SyncProvider["initialize"]>().mockResolvedValue(undefined),
    pull: vi.fn<SyncProvider["pull"]>().mockResolvedValue({ tasks: [] }),
    push: vi.fn<SyncProvider["push"]>().mockResolvedValue(undefined),
    shutdown: vi.fn<SyncProvider["shutdown"]>().mockResolvedValue(undefined),
    mapToTask: vi.fn<SyncProvider["mapToTask"]>().mockImplementation((item) => ({
      id: createTaskId(String(item.externalId)),
      title: item.title,
      status: "todo",
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
    status: "todo",
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

function createTodu(
  project: Project,
  tasks: Task[],
  bindings: IntegrationBinding[],
): {
  instance: Todu;
  integration: {
    list: ReturnType<typeof vi.fn>;
    updateStatus: ReturnType<typeof vi.fn>;
  };
} {
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

  const taskGet = vi.fn().mockImplementation(async (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return ok({ id, description: undefined });
    return ok({ ...task, description: undefined });
  });

  return {
    instance: {
      project: {
        get: vi.fn().mockResolvedValue(ok(project)),
      },
      task: {
        list: vi.fn().mockResolvedValue(ok(tasks)),
        get: taskGet,
      },
      integration: {
        list: integrationList,
        updateStatus,
      },
    } as unknown as Todu,
    integration: {
      list: integrationList,
      updateStatus,
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
