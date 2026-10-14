import { readFileSync } from "node:fs";
import { ok } from "@todu/core";
import type { Todu } from "@todu/engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_RECURRING_WORKER_INTERVAL_MS, workerPlugin } from "./index.js";

describe("recurring-worker plugin", () => {
  it("reports the installed package version", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version: string };

    expect(workerPlugin.manifest.version).toBe(manifest.version);
  });

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
      capabilities: { awaitableStop: true },
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
      capabilities: { awaitableStop: true },
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

  it.each([
    undefined,
    { awaitableStop: false },
  ])("refuses unsupported hosts before allocating resources (%j)", (capabilities) => {
    const getTodu = vi.fn();
    expect(() =>
      workerPlugin.createRuntime({ getTodu, logger: createLogger(), config: {}, capabilities }),
    ).toThrow("requires a host with awaitable-stop support");
    expect(getTodu).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    "startup",
    "interval",
  ])("waits for %s work on repeated stop and prevents new cycles", async (phase) => {
    const deferred = createDeferred<void>();
    const process = vi.fn().mockResolvedValue(ok([]));
    if (phase === "startup")
      process.mockImplementationOnce(async () => {
        await deferred.promise;
        return ok([]);
      });
    const runtime = workerPlugin.createRuntime({
      getTodu: () => createTodu(process),
      logger: createLogger(),
      capabilities: { awaitableStop: true },
      config: { intervalMs: 100 },
    });
    const handle = runtime.start();
    await vi.advanceTimersByTimeAsync(0);
    if (phase === "interval") {
      process.mockImplementationOnce(async () => {
        await deferred.promise;
        return ok([]);
      });
      await vi.advanceTimersByTimeAsync(100);
    }
    const calls = process.mock.calls.length;
    const first = handle.stop();
    expect(handle.stop()).toBe(first);
    let completed = false;
    const stop = Promise.resolve(first).then(() => {
      completed = true;
    });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(completed).toBe(false);
    expect(process).toHaveBeenCalledTimes(calls);
    deferred.resolve();
    await stop;
    expect(completed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
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
      capabilities: { awaitableStop: true },
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
