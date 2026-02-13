import type { Repo } from "@automerge/automerge-repo";
import { WebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";

export const DEFAULT_SYNC_URL = "ws://127.0.0.1:24377";

/**
 * Add a sync client adapter to a Repo, connecting to a remote sync server.
 * Waits for the adapter to be ready before returning.
 * Returns a disconnect function.
 *
 * @param retryInterval - Retry interval in ms if connection fails (default: 500ms for local)
 */
export async function connectSyncClient(
  repo: Repo,
  url: string = DEFAULT_SYNC_URL,
  retryInterval = 500,
): Promise<() => void> {
  const adapter = new WebSocketClientAdapter(url, retryInterval);
  repo.networkSubsystem.addNetworkAdapter(adapter);

  // Wait for the WebSocket connection to establish
  await adapter.whenReady();

  return () => {
    try {
      adapter.disconnect();
    } catch {
      // WebSocket may already be closed — safe to ignore
    }
  };
}

/**
 * Check if a sync server is reachable at the given URL.
 * Returns true if the connection succeeds within the timeout.
 */
export async function isSyncServerAvailable(
  url: string = DEFAULT_SYNC_URL,
  timeoutMs = 200,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      resolve(false);
    }, timeoutMs);

    try {
      // Use dynamic import for ws since it's CJS
      import("ws").then(({ default: WebSocket }) => {
        const ws = new WebSocket(url);

        ws.onopen = () => {
          clearTimeout(timer);
          ws.close();
          resolve(true);
        };

        ws.onerror = () => {
          clearTimeout(timer);
          resolve(false);
        };
      });
    } catch {
      clearTimeout(timer);
      resolve(false);
    }
  });
}
