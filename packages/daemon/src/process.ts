import {
  createDaemonRuntime,
  type DaemonRuntime,
  type DaemonRuntimeConfig,
  type DaemonRuntimeStatus,
} from "./runtime.js";

export interface DaemonProcessHooks {
  onStarted?: (status: DaemonRuntimeStatus) => void;
  onStopping?: (reason: string) => void;
  onStopped?: () => void;
}

export interface StartDaemonProcessOptions {
  registerSignalHandlers?: boolean;
  hooks?: DaemonProcessHooks;
}

export interface DaemonProcess {
  runtime: DaemonRuntime;
  stop(reason?: string): Promise<void>;
  waitForShutdown(): Promise<void>;
}

export async function startDaemonProcess(
  config: DaemonRuntimeConfig,
  options: StartDaemonProcessOptions = {},
): Promise<DaemonProcess> {
  const runtime = createDaemonRuntime(config);
  const { hooks, registerSignalHandlers = true } = options;

  let stopPromise: Promise<void> | null = null;
  let resolveShutdown: (() => void) | null = null;
  let shutdownFailure: { error: unknown } | null = null;
  const shutdownPromise = new Promise<void>((resolve) => {
    resolveShutdown = resolve;
  });

  let handlers: {
    onSigInt: () => void;
    onSigTerm: () => void;
  } | null = null;

  function unregisterSignalHandlers(): void {
    if (!handlers) {
      return;
    }

    process.off("SIGINT", handlers.onSigInt);
    process.off("SIGTERM", handlers.onSigTerm);
    handlers = null;
  }

  const stop = async (reason = "manual"): Promise<void> => {
    if (stopPromise) {
      return stopPromise;
    }

    stopPromise = (async () => {
      try {
        hooks?.onStopping?.(reason);
        await runtime.stop();
        hooks?.onStopped?.();
      } catch (error) {
        shutdownFailure = { error };
        throw error;
      } finally {
        unregisterSignalHandlers();
        resolveShutdown?.();
      }
    })();

    return stopPromise;
  };

  if (registerSignalHandlers) {
    const onSignal = (reason: "SIGINT" | "SIGTERM") => {
      void stop(reason).catch(() => {
        // waitForShutdown() reports the failure to the daemon entrypoint.
        process.exitCode = 1;
      });
    };
    handlers = {
      onSigInt: () => onSignal("SIGINT"),
      onSigTerm: () => onSignal("SIGTERM"),
    };

    process.on("SIGINT", handlers.onSigInt);
    process.on("SIGTERM", handlers.onSigTerm);
  }

  try {
    const started = await runtime.start();
    hooks?.onStarted?.(started);
  } catch (error) {
    unregisterSignalHandlers();
    throw error;
  }

  return {
    runtime,
    stop,
    async waitForShutdown() {
      await shutdownPromise;
      if (shutdownFailure) {
        throw shutdownFailure.error;
      }
    },
  };
}
