import { describe, expect, it, vi } from "vitest";
import { ensureDaemonReady } from "./daemon-startup.js";

describe("ensureDaemonReady", () => {
  it("waits for connection readiness before requesting daemon.hello", async () => {
    const order: string[] = [];
    const waitForConnection = vi.fn(async () => {
      await Promise.resolve();
      order.push("connected");
      return { ok: true as const, value: undefined };
    });
    const request = vi.fn().mockImplementation(async () => {
      order.push("hello");
      return { ok: true as const, value: { protocolVersion: "1" } };
    });
    await ensureDaemonReady({ request, waitForConnection }, { protocolVersion: "1" });
    expect(order).toEqual(["connected", "hello"]);
    expect(request).toHaveBeenCalledWith("daemon.hello", { protocolVersion: "1" });
  });

  it("retries a transient connection failure without starting a daemon", async () => {
    const waitForConnection = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "DAEMON_UNAVAILABLE", message: "connecting" },
      })
      .mockResolvedValueOnce({ ok: true, value: undefined });
    const request = vi.fn().mockResolvedValue({ ok: true, value: { protocolVersion: "1" } });
    await ensureDaemonReady(
      { request, waitForConnection },
      { protocolVersion: "1", maxAttempts: 2, retryDelayMs: 0 },
    );
    expect(waitForConnection).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("surfaces protocol mismatch immediately with actionable guidance", async () => {
    const request = vi.fn().mockResolvedValue({
      ok: false,
      error: {
        code: "PROTOCOL_MISMATCH",
        message: "daemon protocol 2 does not match client protocol 1",
      },
    });
    const waitForConnection = vi.fn().mockResolvedValue({ ok: true, value: undefined });
    await expect(
      ensureDaemonReady({ request, waitForConnection }, { protocolVersion: "1" }),
    ).rejects.toThrow(
      "Local daemon is incompatible (PROTOCOL_MISMATCH: daemon protocol 2 does not match client protocol 1). Use desktop and daemon releases with compatible protocol versions.",
    );
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("preserves protocol mismatch detected in connection lifecycle hooks", async () => {
    const request = vi.fn();
    const waitForConnection = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: "PROTOCOL_MISMATCH", message: "incompatible protocol" },
    });
    await expect(
      ensureDaemonReady({ request, waitForConnection }, { protocolVersion: "1" }),
    ).rejects.toThrow("Local daemon is incompatible");
    expect(request).not.toHaveBeenCalled();
    expect(waitForConnection).toHaveBeenCalledTimes(1);
  });

  it.each([
    "ENOENT",
    "ECONNREFUSED",
    "EACCES",
    "EPERM",
  ])("reports %s with socket context and manual-start guidance", async (reason) => {
    const request = vi.fn();
    const waitForConnection = vi.fn().mockResolvedValue({
      ok: false,
      error: {
        code: "DAEMON_UNAVAILABLE",
        message: `Cannot connect to daemon socket: /tmp/todu.sock (${reason})`,
      },
    });
    await expect(
      ensureDaemonReady({ request, waitForConnection }, { protocolVersion: "1", maxAttempts: 1 }),
    ).rejects.toThrow(
      `Could not connect to the local daemon (DAEMON_UNAVAILABLE: Cannot connect to daemon socket: /tmp/todu.sock (${reason})). Check 'todu daemon status'. If no daemon is running, start it with 'todu daemon start', then relaunch the desktop app. The desktop app does not start or restart daemons automatically.`,
    );
    expect(request).not.toHaveBeenCalled();
  });
});
