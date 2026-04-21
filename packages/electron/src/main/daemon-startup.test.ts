import { describe, expect, it, vi } from "vitest";
import { ensureDaemonReady } from "./daemon-startup.js";

describe("ensureDaemonReady", () => {
  it("succeeds when daemon.hello succeeds", async () => {
    const request = vi.fn().mockResolvedValue({
      ok: true,
      value: { protocolVersion: "1" },
    });

    await expect(
      ensureDaemonReady(
        { request },
        {
          protocolVersion: "1",
          maxAttempts: 1,
          retryDelayMs: 0,
        },
      ),
    ).resolves.toBeUndefined();

    expect(request).toHaveBeenCalledWith("daemon.hello", {
      protocolVersion: "1",
    });
  });

  it("starts the daemon on first unavailable response and then succeeds", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: "DAEMON_UNAVAILABLE",
          message: "socket missing",
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: { protocolVersion: "1" },
      });
    const startDaemon = vi.fn().mockResolvedValue(undefined);

    await expect(
      ensureDaemonReady(
        { request },
        {
          protocolVersion: "1",
          maxAttempts: 2,
          retryDelayMs: 0,
          startDaemon,
        },
      ),
    ).resolves.toBeUndefined();

    expect(startDaemon).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("surfaces bundled daemon startup failures", async () => {
    const request = vi.fn().mockResolvedValue({
      ok: false,
      error: {
        code: "DAEMON_UNAVAILABLE",
        message: "socket missing",
      },
    });
    const startDaemon = vi.fn().mockRejectedValue(new Error("Failed to start bundled daemon"));

    await expect(
      ensureDaemonReady(
        { request },
        {
          protocolVersion: "1",
          maxAttempts: 2,
          retryDelayMs: 0,
          startDaemon,
        },
      ),
    ).rejects.toThrow(
      "Local daemon is required but unavailable (DAEMON_UNAVAILABLE: socket missing). Failed to start bundled daemon",
    );
  });

  it("throws actionable error when daemon stays unavailable", async () => {
    const request = vi.fn().mockResolvedValue({
      ok: false,
      error: {
        code: "DAEMON_UNAVAILABLE",
        message: "socket missing",
      },
    });

    await expect(
      ensureDaemonReady(
        { request },
        {
          protocolVersion: "1",
          maxAttempts: 2,
          retryDelayMs: 0,
          unavailableHint: "todu could not start its bundled daemon.",
        },
      ),
    ).rejects.toThrow(
      "Local daemon is required but unavailable (DAEMON_UNAVAILABLE: socket missing). todu could not start its bundled daemon.",
    );
  });
});
