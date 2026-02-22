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
      hooks?.onStopping?.(reason);
      unregisterSignalHandlers();

      try {
        await runtime.stop();
      } finally {
        hooks?.onStopped?.();
        resolveShutdown?.();
      }
    })();

    return stopPromise;
  };

  if (registerSignalHandlers) {
    handlers = {
      onSigInt: () => {
        void stop("SIGINT");
      },
      onSigTerm: () => {
        void stop("SIGTERM");
      },
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
    waitForShutdown: () => shutdownPromise,
  };
}
