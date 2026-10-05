import { asyncThrottle } from "@automerge/automerge-repo/helpers/throttle.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Repo storage throttle scheduling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("schedules an overdue write with a nonnegative delay and preserves its result", async () => {
    const write = vi.fn(async () => "saved");
    const throttled = asyncThrottle(write, 100);
    const setTimer = vi.spyOn(globalThis, "setTimeout");
    vi.setSystemTime(1200);

    const pending = throttled();

    expect(setTimer).toHaveBeenLastCalledWith(expect.any(Function), 0);
    expect(write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBe("saved");
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("preserves the positive delay remaining in the throttle window", async () => {
    const write = vi.fn(async () => "saved");
    const throttled = asyncThrottle(write, 100);
    const setTimer = vi.spyOn(globalThis, "setTimeout");
    vi.setSystemTime(1030);

    const pending = throttled();

    expect(setTimer).toHaveBeenLastCalledWith(expect.any(Function), 70);
    await vi.advanceTimersByTimeAsync(69);
    expect(write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBe("saved");
  });

  it("waits for an in-flight write and then delays its successor from completion", async () => {
    let releaseFirst!: (value: string) => void;
    const firstWrite = new Promise<string>((resolve) => {
      releaseFirst = resolve;
    });
    const write = vi.fn(async (value: string) => (value === "first" ? firstWrite : value));
    const throttled = asyncThrottle(write, 100);
    const setTimer = vi.spyOn(globalThis, "setTimeout");

    const first = throttled("first");
    await vi.advanceTimersByTimeAsync(100);
    expect(write).toHaveBeenCalledTimes(1);
    const second = throttled("second");
    await vi.advanceTimersByTimeAsync(1000);
    expect(write).toHaveBeenCalledTimes(1);

    releaseFirst("first");
    await expect(first).resolves.toBe("first");
    await vi.advanceTimersByTimeAsync(0);
    expect(setTimer).toHaveBeenLastCalledWith(expect.any(Function), 100);
    await vi.advanceTimersByTimeAsync(99);
    expect(write).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(second).resolves.toBe("second");
    expect(write.mock.calls).toEqual([["first"], ["second"]]);
  });

  it("propagates an overdue write failure and still permits the next write", async () => {
    const write = vi.fn(async () => "saved").mockRejectedValueOnce(new Error("disk failed"));
    const throttled = asyncThrottle(write, 100);
    vi.setSystemTime(1200);
    const rejected = expect(throttled()).rejects.toThrow("disk failed");
    await vi.advanceTimersByTimeAsync(1);
    await rejected;

    const next = throttled();
    await vi.advanceTimersByTimeAsync(100);
    await expect(next).resolves.toBe("saved");
    expect(write).toHaveBeenCalledTimes(2);
  });
});
