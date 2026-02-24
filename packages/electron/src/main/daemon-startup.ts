import type { DaemonConnectionManager } from "./daemon-connection-manager.js";

export interface EnsureDaemonReadyOptions {
  protocolVersion: string;
  maxAttempts?: number;
  retryDelayMs?: number;
}

export async function ensureDaemonReady(
  daemon: Pick<DaemonConnectionManager, "request">,
  options: EnsureDaemonReadyOptions,
): Promise<void> {
  const maxAttempts = options.maxAttempts ?? 10;
  const retryDelayMs = options.retryDelayMs ?? 200;

  let lastError = "unknown daemon error";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const hello = await daemon.request<{ protocolVersion: string }>("daemon.hello", {
      protocolVersion: options.protocolVersion,
    });

    if (hello.ok) {
      return;
    }

    lastError = `${hello.error.code}: ${hello.error.message}`;

    if (attempt < maxAttempts) {
      await wait(retryDelayMs);
    }
  }

  throw new Error(
    `Local daemon is required but unavailable (${lastError}). Start it with 'todu daemon start' and relaunch Electron.`,
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
