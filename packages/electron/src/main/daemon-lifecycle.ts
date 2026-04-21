import type { DaemonReconnectInfo } from "./daemon-connection-manager.js";
import { startBundledDaemonProcess } from "./daemon-runtime.js";

export interface PackagedDaemonLifecycleOptions {
  appPath: string;
  socketPath: string;
  onError?: (message: string) => void;
  startDaemon?: typeof startBundledDaemonProcess;
}

export interface PackagedDaemonLifecycle {
  startIfNeeded(): Promise<void>;
  handleReconnectScheduled(info: DaemonReconnectInfo): void;
  unavailableHint: string;
}

const PACKAGED_DAEMON_UNAVAILABLE_HINT =
  "todu could not start its bundled daemon. Relaunch the app or reinstall it if the problem persists.";
const PACKAGED_DAEMON_RESTART_FAILED_HINT =
  "todu lost connection to its local daemon and could not restart it. Relaunch the app or reinstall it if the problem persists.";

export function createPackagedDaemonLifecycle(
  options: PackagedDaemonLifecycleOptions,
): PackagedDaemonLifecycle {
  let startupPromise: Promise<void> | null = null;
  const startDaemon = options.startDaemon ?? startBundledDaemonProcess;

  const startIfNeeded = async (): Promise<void> => {
    if (startupPromise) {
      return startupPromise;
    }

    startupPromise = startDaemon({
      isPackaged: true,
      appPath: options.appPath,
      socketPath: options.socketPath,
    }).then(() => undefined);

    try {
      await startupPromise;
    } finally {
      startupPromise = null;
    }
  };

  const handleReconnectScheduled = (info: DaemonReconnectInfo): void => {
    if (!isDaemonUnavailableReason(info.reason)) {
      return;
    }

    void startIfNeeded().catch((error) => {
      options.onError?.(
        `${PACKAGED_DAEMON_RESTART_FAILED_HINT} ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  };

  return {
    startIfNeeded,
    handleReconnectScheduled,
    unavailableHint: PACKAGED_DAEMON_UNAVAILABLE_HINT,
  };
}

function isDaemonUnavailableReason(reason: unknown): boolean {
  if (!(reason instanceof Error)) {
    return false;
  }

  return (
    reason.message.includes("DAEMON_UNAVAILABLE") || reason.message.includes("Daemon unavailable")
  );
}
