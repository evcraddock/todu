import type { Repo } from "@automerge/automerge-repo";
import { WebSocketServerAdapter } from "@automerge/automerge-repo-network-websocket";
import type { WebSocketServer as IsoWebSocketServer } from "isomorphic-ws";
import { WebSocketServer } from "ws";

export const DEFAULT_SYNC_PORT = 24377;

export interface SyncServer {
  port: number;
  close(): Promise<void>;
}

/**
 * Start a WebSocket sync server and attach it to an Automerge Repo.
 * Other Repo instances (CLI, other devices) can connect and sync documents.
 */
export function startSyncServer(repo: Repo, port: number = DEFAULT_SYNC_PORT): SyncServer {
  const wss = new WebSocketServer({ host: "127.0.0.1", port });
  const adapter = new WebSocketServerAdapter(wss as unknown as IsoWebSocketServer);
  repo.networkSubsystem.addNetworkAdapter(adapter);

  return {
    port,
    close() {
      return new Promise<void>((resolve) => {
        wss.close(() => resolve());
      });
    },
  };
}
