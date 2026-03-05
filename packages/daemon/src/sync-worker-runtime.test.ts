import {
  createProjectId,
  createTaskId,
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

  it("executes pull/push cycles on configured interval", async () => {
    const provider = createProvider();
    const project = createProject();
    const task = createTask(project.id);

    const runtime = createSyncPluginWorkerRuntime({
      pluginName: "github",
      pluginVersion: "1.0.0",
      modulePath: "/plugins/github.js",
      provider,
      config: {
        enabled: true,
        projectId: project.id,
        strategy: "bidirectional",
        intervalMs: 1_000,
        retryInitialMs: 100,
        retryMaxMs: 800,
        settings: {},
      },
      logger: createLogger(),
      getTodu: () => createTodu(project, [task]),
    });

    const handle = runtime.start();

    await vi.advanceTimersByTimeAsync(0);
    expect(provider.initialize).toHaveBeenCalledTimes(1);
    expect(provider.pull).toHaveBeenCalledTimes(1);
    expect(provider.push).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(999);
    expect(provider.pull).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(provider.pull).toHaveBeenCalledTimes(2);
    expect(provider.push).toHaveBeenCalledTimes(2);

    handle.stop();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(provider.pull).toHaveBeenCalledTimes(2);
    expect(provider.push).toHaveBeenCalledTimes(2);
    expect(provider.shutdown).toHaveBeenCalledTimes(1);
  });

  it("retries failed cycles with exponential backoff", async () => {
    const provider = createProvider({
      pull: vi
        .fn<SyncProvider["pull"]>()
        .mockRejectedValueOnce(new Error("network down"))
        .mockRejectedValueOnce(new Error("network down"))
        .mockResolvedValue(undefined),
    });
    const project = createProject();

    const runtime = createSyncPluginWorkerRuntime({
      pluginName: "github",
      pluginVersion: "1.0.0",
      modulePath: "/plugins/github.js",
      provider,
      config: {
        enabled: true,
        projectId: project.id,
        strategy: "pull",
        intervalMs: 1_000,
        retryInitialMs: 100,
        retryMaxMs: 400,
        settings: {},
      },
      logger: createLogger(),
      getTodu: () => createTodu(project, []),
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

    await vi.advanceTimersByTimeAsync(999);
    expect(provider.pull).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(1);
    expect(provider.pull).toHaveBeenCalledTimes(4);

    expect(provider.initialize).toHaveBeenCalledTimes(1);

    handle.stop();
  });

  it("stops without orphaning scheduled loops and shuts down provider", async () => {
    const deferred = createDeferred<void>();
    const provider = createProvider({
      pull: vi.fn<SyncProvider["pull"]>().mockImplementation(async () => {
        await deferred.promise;
      }),
    });
    const project = createProject();

    const runtime = createSyncPluginWorkerRuntime({
      pluginName: "github",
      pluginVersion: "1.0.0",
      modulePath: "/plugins/github.js",
      provider,
      config: {
        enabled: true,
        projectId: project.id,
        strategy: "pull",
        intervalMs: 1_000,
        retryInitialMs: 100,
        retryMaxMs: 400,
        settings: {},
      },
      logger: createLogger(),
      getTodu: () => createTodu(project, []),
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

  it("resolves config defaults and clamps retry max", () => {
    const resolved = resolveSyncPluginExecutionConfig("github", {
      retryInitialSeconds: 12,
      retryMaxSeconds: 5,
      strategy: "invalid",
      enabled: "yes",
      intervalSeconds: -1,
      settings: "oops",
    });

    expect(resolved.config).toEqual({
      enabled: true,
      projectId: undefined,
      strategy: "bidirectional",
      intervalMs: 300_000,
      retryInitialMs: 12_000,
      retryMaxMs: 12_000,
      settings: {},
    });
    expect(resolved.warnings.length).toBeGreaterThan(0);
    expect(computeRetryDelayMs(0, resolved.config)).toBe(12_000);
    expect(computeRetryDelayMs(3, resolved.config)).toBe(12_000);
  });
});

function createProvider(overrides: Partial<SyncProvider> = {}): SyncProvider {
  return {
    initialize: vi.fn<SyncProvider["initialize"]>().mockResolvedValue(undefined),
    pull: vi.fn<SyncProvider["pull"]>().mockResolvedValue(undefined),
    push: vi.fn<SyncProvider["push"]>().mockResolvedValue(undefined),
    shutdown: vi.fn<SyncProvider["shutdown"]>().mockResolvedValue(undefined),
    mapToTask: vi.fn<SyncProvider["mapToTask"]>().mockImplementation((item) => ({
      id: createTaskId(String(item.id)),
      title: String(item.id),
      status: "todo",
      priority: "medium",
      projectId: createProject().id,
      labels: [],
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    })),
    mapFromTask: vi.fn<SyncProvider["mapFromTask"]>().mockImplementation((task) => ({
      id: task.id,
      title: task.title,
    })),
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
    syncStrategy: "none",
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
    createdAt: now,
    updatedAt: now,
  };
}

function createTodu(project: Project, tasks: Task[]): Todu {
  return {
    project: {
      get: vi.fn().mockResolvedValue(ok(project)),
    },
    task: {
      list: vi.fn().mockResolvedValue(ok(tasks)),
    },
  } as unknown as Todu;
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
