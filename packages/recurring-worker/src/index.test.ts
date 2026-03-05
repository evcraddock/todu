import { ok } from "@todu/core";
import type { Todu } from "@todu/engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_RECURRING_WORKER_INTERVAL_MS, workerPlugin } from "./index.js";

describe("recurring-worker plugin", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("runs recurring.process on startup and interval", async () => {
    const recurringProcess = vi.fn().mockResolvedValue(ok([]));
    const runtime = workerPlugin.createRuntime({
      getTodu: () => createTodu(recurringProcess),
      logger: createLogger(),
      config: {
        intervalSeconds: 2,
      },
    });

    const handle = runtime.start();

    await vi.advanceTimersByTimeAsync(0);
    expect(recurringProcess).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_999);
    expect(recurringProcess).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(recurringProcess).toHaveBeenCalledTimes(2);

    handle.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(recurringProcess).toHaveBeenCalledTimes(2);
  });

  it("falls back to default interval when config is invalid", async () => {
    const recurringProcess = vi.fn().mockResolvedValue(ok([]));
    const runtime = workerPlugin.createRuntime({
      getTodu: () => createTodu(recurringProcess),
      logger: createLogger(),
      config: {
        intervalSeconds: -1,
      },
    });

    const handle = runtime.start();

    await vi.advanceTimersByTimeAsync(0);
    expect(recurringProcess).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(DEFAULT_RECURRING_WORKER_INTERVAL_MS - 1);
    expect(recurringProcess).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(recurringProcess).toHaveBeenCalledTimes(2);

    handle.stop();
  });

  it("does not run overlapping process cycles", async () => {
    const deferred = createDeferred<void>();
    const recurringProcess = vi.fn().mockImplementation(async () => {
      await deferred.promise;
      return ok([]);
    });

    const runtime = workerPlugin.createRuntime({
      getTodu: () => createTodu(recurringProcess),
      logger: createLogger(),
      config: {
        intervalMs: 100,
      },
    });

    const handle = runtime.start();

    await vi.advanceTimersByTimeAsync(0);
    expect(recurringProcess).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(recurringProcess).toHaveBeenCalledTimes(1);

    deferred.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(100);

    expect(recurringProcess).toHaveBeenCalledTimes(2);

    handle.stop();
  });
});

function createTodu(recurringProcess: () => Promise<unknown>): Todu {
  return {
    recurring: {
      process: recurringProcess,
    },
  } as unknown as Todu;
}

function createLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function createDeferred<T>() {
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
