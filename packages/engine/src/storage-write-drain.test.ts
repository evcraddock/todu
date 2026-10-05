import type { StorageAdapterInterface } from "@automerge/automerge-repo/slim";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createStorageWriteDrain,
  STORAGE_CLOSE_TIMEOUT_MS,
  STORAGE_SAVE_QUIET_MS,
  withStorageCloseTimeout,
} from "./storage-write-drain.js";

function adapter(): StorageAdapterInterface {
  return {
    load: vi.fn().mockResolvedValue(undefined),
    loadRange: vi.fn().mockResolvedValue([]),
    save: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    removeRange: vi.fn().mockResolvedValue(undefined),
  };
}

describe("local storage write drain", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for slow writes and a throttled successor instead of a fixed cleanup delay", async () => {
    const underlying = adapter();
    let releaseFirst!: () => void;
    let releaseSecond!: () => void;
    vi.mocked(underlying.save)
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            releaseFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            releaseSecond = resolve;
          }),
      );
    const writes = createStorageWriteDrain(underlying);
    const first = writes.adapter.save(["doc", "snapshot", "one"], new Uint8Array([1]));
    let done = false;
    const drained = writes.drain().then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(done).toBe(false);
    releaseFirst();
    await first;
    setTimeout(() => {
      void writes.adapter.save(["doc", "snapshot", "two"], new Uint8Array([2]));
    }, 100);
    await vi.advanceTimersByTimeAsync(STORAGE_SAVE_QUIET_MS);
    expect(done).toBe(false);
    releaseSecond();
    await vi.advanceTimersByTimeAsync(STORAGE_SAVE_QUIET_MS * 2);
    await drained;
    expect(underlying.save).toHaveBeenCalledTimes(2);
  });

  it("tracks deletes and preserves write failures for shutdown reporting", async () => {
    const underlying = adapter();
    const error = new Error("disk failure");
    vi.mocked(underlying.removeRange).mockRejectedValueOnce(error);
    const writes = createStorageWriteDrain(underlying);
    await expect(writes.adapter.removeRange(["doc"])).rejects.toBe(error);
    const rejected = expect(writes.drain()).rejects.toThrow("Local storage writes failed");
    await vi.advanceTimersByTimeAsync(STORAGE_SAVE_QUIET_MS);
    await rejected;
  });

  it("bounds hung shutdown and explicitly reports that writes may remain active", async () => {
    const rejected = expect(
      withStorageCloseTimeout(() => new Promise<void>(() => {})),
    ).rejects.toThrow("pending writes may still be active");
    await vi.advanceTimersByTimeAsync(STORAGE_CLOSE_TIMEOUT_MS);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the deadline after successful shutdown or failure", async () => {
    await withStorageCloseTimeout(async () => {});
    await expect(
      withStorageCloseTimeout(async () => {
        throw new Error("close failed");
      }),
    ).rejects.toThrow("close failed");
    expect(vi.getTimerCount()).toBe(0);
  });
});
