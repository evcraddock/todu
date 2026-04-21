import { describe, expect, it, vi } from "vitest";
import { createPackagedDaemonLifecycle } from "./daemon-lifecycle.js";

describe("createPackagedDaemonLifecycle", () => {
  it("starts the bundled daemon with packaged app settings", async () => {
    const startDaemon = vi.fn().mockResolvedValue(undefined);
    const lifecycle = createPackagedDaemonLifecycle({
      appPath: "/opt/todu/resources/app.asar",
      socketPath: "/tmp/daemon.sock",
      startDaemon,
    });

    await lifecycle.startIfNeeded();

    expect(startDaemon).toHaveBeenCalledWith({
      isPackaged: true,
      appPath: "/opt/todu/resources/app.asar",
      socketPath: "/tmp/daemon.sock",
    });
  });

  it("deduplicates concurrent start attempts", async () => {
    let resolveStart: (() => void) | null = null;
    const startDaemon = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveStart = resolve;
        }),
    );
    const lifecycle = createPackagedDaemonLifecycle({
      appPath: "/opt/todu/resources/app.asar",
      socketPath: "/tmp/daemon.sock",
      startDaemon,
    });

    const first = lifecycle.startIfNeeded();
    const second = lifecycle.startIfNeeded();
    resolveStart?.();

    await Promise.all([first, second]);

    expect(startDaemon).toHaveBeenCalledTimes(1);
  });

  it("tries to restart the daemon when reconnect is scheduled for daemon-unavailable errors", async () => {
    const startDaemon = vi.fn().mockResolvedValue(undefined);
    const lifecycle = createPackagedDaemonLifecycle({
      appPath: "/opt/todu/resources/app.asar",
      socketPath: "/tmp/daemon.sock",
      startDaemon,
    });

    lifecycle.handleReconnectScheduled({
      attempt: 1,
      delayMs: 250,
      reason: new Error("Daemon unavailable at socket: /tmp/daemon.sock"),
    });

    await vi.waitFor(() => {
      expect(startDaemon).toHaveBeenCalledTimes(1);
    });
  });

  it("does not restart the daemon for non-availability reconnect reasons", async () => {
    const startDaemon = vi.fn().mockResolvedValue(undefined);
    const lifecycle = createPackagedDaemonLifecycle({
      appPath: "/opt/todu/resources/app.asar",
      socketPath: "/tmp/daemon.sock",
      startDaemon,
    });

    lifecycle.handleReconnectScheduled({
      attempt: 1,
      delayMs: 250,
      reason: new Error("Protocol version mismatch"),
    });

    await Promise.resolve();

    expect(startDaemon).not.toHaveBeenCalled();
  });

  it("reports actionable restart failures", async () => {
    const onError = vi.fn();
    const startDaemon = vi.fn().mockRejectedValue(new Error("spawn failed"));
    const lifecycle = createPackagedDaemonLifecycle({
      appPath: "/opt/todu/resources/app.asar",
      socketPath: "/tmp/daemon.sock",
      startDaemon,
      onError,
    });

    lifecycle.handleReconnectScheduled({
      attempt: 1,
      delayMs: 250,
      reason: new Error("DAEMON_UNAVAILABLE: socket missing"),
    });

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledWith(
        "todu lost connection to its local daemon and could not restart it. Relaunch the app or reinstall it if the problem persists. spawn failed",
      );
    });
  });
});
