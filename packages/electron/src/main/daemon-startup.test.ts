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

  it("retries and then succeeds", async () => {
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

    await expect(
      ensureDaemonReady(
        { request },
        {
          protocolVersion: "1",
          maxAttempts: 2,
          retryDelayMs: 0,
        },
      ),
    ).resolves.toBeUndefined();

    expect(request).toHaveBeenCalledTimes(2);
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
        },
      ),
    ).rejects.toThrow(
      "Local daemon is required but unavailable (DAEMON_UNAVAILABLE: socket missing). Start it with 'todu daemon start' and relaunch Electron.",
    );
  });
});
