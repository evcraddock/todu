import type { Repo } from "@automerge/automerge-repo";
import { WebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";

export const DEFAULT_SYNC_URL = "ws://127.0.0.1:24377";

export interface SyncAdapterEventLogger {
  warn(message: string, context?: Record<string, unknown>): void;
}

const TRANSIENT_SOCKET_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EPIPE",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
]);

const TRANSIENT_SOCKET_ERROR_MESSAGE_PATTERNS = [
  /failed to connect/i,
  /connection failed/i,
  /connect ECONNREFUSED/i,
  /read ECONNRESET/i,
  /socket hang up/i,
];

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
  hardenWebSocketClientAdapterErrors(adapter);
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
 * Add a remote sync adapter to a Repo without blocking.
 *
 * Unlike connectSyncClient(), this does NOT await the connection — the remote
 * server may be temporarily unreachable. The adapter retries initial connection
 * attempts at a bounded interval. After the first connection, Todu's watchdog
 * owns reconnection so a removed adapter cannot create zombie sockets.
 *
 * Returns the adapter so callers can listen for connection events and remove it.
 *
 * @param retryInterval - Initial connection retry interval in ms (default: 30s)
 */
export function addRemoteSyncAdapter(
  repo: Repo,
  url: string,
  retryInterval = 30_000,
  logger?: SyncAdapterEventLogger,
): WebSocketClientAdapter {
  const adapter = new WebSocketClientAdapter(url, retryInterval);
  hardenWebSocketClientAdapterErrors(adapter, logger, { watchdogOwnsReconnect: true });
  repo.networkSubsystem.addNetworkAdapter(adapter);
  return adapter;
}

/**
 * Remove a remote adapter only after its socket, timers, and listeners are disposed.
 */
export function disposeRemoteSyncAdapter(repo: Repo, adapter: WebSocketClientAdapter): void {
  disposedAdapters.add(adapter);

  let disposalError: unknown;
  try {
    repo.networkSubsystem.removeNetworkAdapter(adapter);
  } catch (error) {
    disposalError = error;
  } finally {
    adapter.removeAllListeners();
  }

  if (disposalError) {
    throw new Error(
      `Failed to dispose remote sync adapter for ${adapter.url}: ${getErrorMessage(disposalError)}`,
      { cause: disposalError },
    );
  }

  if (adapter.socket) {
    throw new Error(
      `Failed to dispose remote sync adapter for ${adapter.url}: socket is still set`,
    );
  }
}

const disposedAdapters = new WeakSet<WebSocketClientAdapter>();
const hardenedSockets = new WeakSet<object>();

export function hardenWebSocketClientAdapterErrors(
  adapter: WebSocketClientAdapter,
  logger?: SyncAdapterEventLogger,
  options: { watchdogOwnsReconnect?: boolean } = {},
): void {
  const originalOnError = adapter.onError;
  const originalConnect = adapter.connect.bind(adapter);
  const originalDisconnect = adapter.disconnect.bind(adapter);

  adapter.onError = (event) => {
    logger?.warn("remote sync adapter error", {
      error: getErrorMessage(getEventError(event) ?? event),
    });

    try {
      originalOnError(event);
    } catch (error) {
      const eventError = getEventError(event);
      if (isTransientSocketError(error) || isTransientSocketError(eventError)) {
        return;
      }

      throw error;
    }
  };

  if (options.watchdogOwnsReconnect) {
    adapter.onClose = () => {
      if (disposedAdapters.has(adapter)) return;

      if (adapter.remotePeerId) {
        adapter.emit("peer-disconnected", { peerId: adapter.remotePeerId });
      }
    };
  }

  adapter.connect = (...args: Parameters<WebSocketClientAdapter["connect"]>) => {
    if (disposedAdapters.has(adapter)) return;

    originalConnect(...args);
    hardenCurrentWebSocket(adapter);
  };

  adapter.disconnect = () => {
    disposedAdapters.add(adapter);

    if (!adapter.peerId || !adapter.socket) {
      const socket = adapter.socket;
      if (socket) {
        socket.removeEventListener("open", adapter.onOpen);
        socket.removeEventListener("close", adapter.onClose);
        socket.removeEventListener("message", adapter.onMessage);
        socket.removeEventListener("error", adapter.onError);
        socket.close();
      }
      adapter.remotePeerId = undefined;
      adapter.socket = undefined;
      return;
    }

    originalDisconnect();
    adapter.remotePeerId = undefined;
  };

  hardenCurrentWebSocket(adapter);
}

function hardenCurrentWebSocket(adapter: WebSocketClientAdapter): void {
  const socket = adapter.socket;
  if (typeof socket !== "object" || socket === null || hardenedSockets.has(socket)) {
    return;
  }

  const eventEmitterSocket = socket as {
    on?: (event: "error", listener: (error: unknown) => void) => void;
  };
  if (typeof eventEmitterSocket.on !== "function") {
    return;
  }

  hardenedSockets.add(socket);
  eventEmitterSocket.on("error", () => {
    // Transient WebSocket errors are surfaced through `onError`; this listener prevents Node from treating an otherwise handled socket error as fatal.
  });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function getEventError(event: unknown): unknown {
  if (typeof event !== "object" || event === null) {
    return undefined;
  }

  if (!("error" in event)) {
    return undefined;
  }

  return (event as { error?: unknown }).error;
}

function isTransientSocketError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && TRANSIENT_SOCKET_ERROR_CODES.has(code)) {
    return true;
  }

  const message = (error as { message?: unknown }).message;
  if (
    typeof message === "string" &&
    TRANSIENT_SOCKET_ERROR_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))
  ) {
    return true;
  }

  return false;
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
