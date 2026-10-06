import type {
  DaemonConnectionError,
  DaemonConnectionManager,
} from "./daemon-connection-manager.js";

export interface EnsureDaemonReadyOptions {
  protocolVersion: string;
  maxAttempts?: number;
  retryDelayMs?: number;
  unavailableHint?: string;
  protocolMismatchHint?: string;
}

export async function ensureDaemonReady(
  daemon: Pick<DaemonConnectionManager, "request" | "waitForConnection">,
  options: EnsureDaemonReadyOptions,
): Promise<void> {
  const maxAttempts = options.maxAttempts ?? 10;
  const retryDelayMs = options.retryDelayMs ?? 200;
  let lastError = "unknown daemon error";
  let lastCause: DaemonConnectionError | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const connection = await daemon.waitForConnection();
    const hello = connection.ok
      ? await daemon.request<{ protocolVersion: string }>("daemon.hello", {
          protocolVersion: options.protocolVersion,
        })
      : connection;

    if (hello.ok) {
      return;
    }

    lastCause = hello.error;
    lastError = `${hello.error.code}: ${hello.error.message}`;
    if (hello.error.code === "PROTOCOL_MISMATCH") {
      throw Object.assign(
        new Error(
          `Local daemon is incompatible (${lastError}). ${options.protocolMismatchHint ?? "Use desktop and daemon releases with compatible protocol versions."}`,
          { cause: hello.error },
        ),
        { code: hello.error.code },
      );
    }

    if (attempt < maxAttempts) {
      await new Promise<void>((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  throw Object.assign(
    new Error(
      `Could not connect to the local daemon (${lastError}). ${options.unavailableHint ?? "Check 'todu daemon status'. If no daemon is running, start it with 'todu daemon start', then relaunch the desktop app. The desktop app does not start or restart daemons automatically."}`,
      { cause: lastCause },
    ),
    { code: lastCause?.code },
  );
}
