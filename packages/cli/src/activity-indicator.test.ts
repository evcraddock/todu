import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withActivityIndicator } from "./activity-indicator.js";

describe("lifecycle activity indicator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    false,
    true,
  ])("animates while waiting and clears on completion (failure=%s)", async (failure) => {
    const output = { isTTY: true, write: vi.fn() };
    let finish!: () => void;
    const waiting = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const run = withActivityIndicator({
      enabled: true,
      message: "Stopping daemon",
      output,
      operation: async () => {
        await waiting;
        if (failure) throw new Error("stop failed");
        return "stopped";
      },
    });
    const result = failure
      ? expect(run).rejects.toThrow("stop failed")
      : expect(run).resolves.toBe("stopped");
    await vi.advanceTimersByTimeAsync(500);
    expect(output.write.mock.calls.map(([text]) => text)).toEqual([
      "\r\u001b[2KStopping daemon.",
      "\r\u001b[2KStopping daemon..",
      "\r\u001b[2KStopping daemon...",
    ]);
    finish();
    await result;
    expect(output.write).toHaveBeenLastCalledWith("\r\u001b[2K");
    expect(vi.getTimerCount()).toBe(0);
    const calls = output.write.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(output.write).toHaveBeenCalledTimes(calls);
  });

  it.each([
    { enabled: false, isTTY: true },
    { enabled: true, isTTY: false },
  ])("does not animate disabled or noninteractive output (%j)", async ({ enabled, isTTY }) => {
    const output = { isTTY, write: vi.fn() };
    await expect(
      withActivityIndicator({
        enabled,
        output,
        message: "Stopping daemon",
        operation: async () => "done",
      }),
    ).resolves.toBe("done");
    expect(output.write).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
