import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { isIP } from "node:net";
import type { Repo } from "@automerge/automerge-repo";
import { WebSocketServerAdapter } from "@automerge/automerge-repo-network-websocket";
import {
  err,
  ok,
  type ResolvedSyncListenerConfig,
  type Result,
  type StorageError,
  storageError,
} from "@todu/core";
import type { WebSocketServer as IsoWebSocketServer } from "isomorphic-ws";
import { WebSocketServer } from "ws";
import { assertNativePeerIdentity } from "./peer-identity.js";
import type { SyncAdapterEventLogger } from "./sync-client.js";

export interface SyncListener {
  syncPath: string;
  close(): Promise<void>;
}

interface StartSyncListenerOptions {
  repo: Repo;
  catalogId: string;
  config: ResolvedSyncListenerConfig;
  logger?: SyncAdapterEventLogger;
  onError(message: string): void;
  httpHandler?: (request: IncomingMessage, response: ServerResponse) => Promise<boolean>;
}

/** Attach a native replication listener to the existing Repo, not a second dataset. */
export async function startSyncListener(
  options: StartSyncListenerOptions,
): Promise<Result<SyncListener, StorageError>> {
  const { repo, catalogId, config, logger } = options;
  const syncPath = `/sync/${catalogId}`;
  const httpOperations = new Set<Promise<void>>();
  const server = createServer(
    { requestTimeout: 5_000, headersTimeout: 5_000 },
    (request, response) => {
      const operation = (async () => {
        try {
          if (options.httpHandler && (await options.httpHandler(request, response))) return;
          response.writeHead(404, { Connection: "close", "Content-Type": "text/plain" });
          response.end("Not found\n");
        } catch (error) {
          logger?.warn("LAN enrollment HTTP request failed", { error: String(error) });
          if (!response.destroyed && !response.headersSent) {
            response.writeHead(503, { Connection: "close" });
            response.end("Enrollment request failed\n");
          }
        }
      })();
      httpOperations.add(operation);
      void operation.finally(() => httpOperations.delete(operation));
    },
  );
  const wss = new WebSocketServer({ noServer: true });
  const adapter = new WebSocketServerAdapter(wss as unknown as IsoWebSocketServer);
  const localId = await repo.storageId();
  // Validate before the Repo's peer-candidate handler admits the native connection.
  adapter.on("peer-candidate", ({ peerId, peerMetadata }) => {
    assertNativePeerIdentity({ repo, localId, peerId, storageId: peerMetadata?.storageId });
  });
  const receiveMessage = adapter.receiveMessage.bind(adapter);
  adapter.receiveMessage = (...args: Parameters<WebSocketServerAdapter["receiveMessage"]>) => {
    try {
      receiveMessage(...args);
    } catch (error) {
      // Native decoding/dispatch failures are contained at this network boundary, not daemon RPC.
      logger?.warn("LAN sync adapter rejected a message", { error: String(error) });
      args[1].close(1002, "Invalid replication message");
    }
  };
  let attached = false;
  let closePromise: Promise<void> | undefined;

  const close = (): Promise<void> => {
    closePromise ??= (async () => {
      if (attached) {
        repo.networkSubsystem.removeNetworkAdapter(adapter);
        attached = false;
      }
      const websocketClosed = new Promise<void>((resolve, reject) => {
        wss.close((error) => (error ? reject(error) : resolve()));
      });
      const httpClosed = new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
      await Promise.all([websocketClosed, httpClosed]);
      await Promise.all(httpOperations);
      adapter.removeAllListeners();
    })();
    return closePromise;
  };

  server.on("upgrade", (request, socket, head) => {
    if (request.url !== syncPath || !attached) {
      socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n", () =>
        socket.destroy(),
      );
      return;
    }
    wss.handleUpgrade(request, socket, head, (websocket) => {
      wss.emit("connection", websocket, request);
    });
  });
  wss.on("connection", (socket) => {
    socket.on("error", (error) => {
      logger?.warn("LAN sync WebSocket error", { error: error.message });
      socket.terminate();
    });
  });

  const describeError = (error: Error): string => {
    const code = (error as NodeJS.ErrnoException).code;
    const remedy =
      code === "EADDRINUSE"
        ? "Free the configured port or explicitly configure a different port."
        : code === "EADDRNOTAVAIL"
          ? "Configure an address assigned to this machine."
          : "Check the configured address, port, and local permissions.";
    return `LAN sync listener failed at ${config.bind}:${config.port}: ${error.message}. ${remedy} Local daemon operations remain available.`;
  };

  const bindError = await new Promise<Error | null>((resolve) => {
    const onError = (error: Error): void => {
      server.off("listening", onListening);
      resolve(error);
    };
    const onListening = (): void => {
      server.off("error", onError);
      resolve(null);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen({
      host: config.bind,
      port: config.port,
      // An explicit IPv6 binding must not implicitly add IPv4 interfaces.
      ipv6Only: isIP(config.bind) === 6,
    });
  });

  if (bindError) {
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    return err(storageError(describeError(bindError)));
  }

  server.on("error", (error) => options.onError(describeError(error)));
  repo.networkSubsystem.addNetworkAdapter(adapter);
  attached = true;
  return ok({ syncPath, close });
}
