import type { Repo } from "@automerge/automerge-repo/slim";
import type { WebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import type { EnrollmentApproval } from "@todu/core";
import {
  addRemoteSyncAdapter,
  disposeRemoteSyncAdapter,
  type SyncAdapterEventLogger,
} from "./sync-client.js";

export interface EnrollmentSource {
  endpoint: string;
  approval: EnrollmentApproval;
}
export interface EnrollmentPeerConnection {
  source: EnrollmentSource;
  ready(signal?: AbortSignal): Promise<void>;
  close(): void;
}
export function enrollmentSyncUrl(source: EnrollmentSource): string {
  const url = new URL(source.approval.syncPath, source.endpoint);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.href;
}

/** One explicit approved source link; automatic registry topology is separate work. */
export function createEnrollmentPeerConnection(options: {
  repo: Repo;
  source: EnrollmentSource;
  logger?: SyncAdapterEventLogger;
}): EnrollmentPeerConnection {
  const { repo, source, logger } = options;
  let adapter: WebSocketClientAdapter | null = null;
  let verified = false;
  let failure: string | undefined;
  let closed = false;
  let handshakeStartedAt = Date.now();

  function connect(): void {
    handshakeStartedAt = Date.now();
    verified = false;
    failure = undefined;
    const next = addRemoteSyncAdapter(repo, enrollmentSyncUrl(source), 2_000, logger);
    adapter = next;
    const peerCandidate = next.peerCandidate.bind(next);
    next.peerCandidate = (peerId, metadata) => {
      if (closed) return;
      if (
        typeof metadata?.storageId !== "string" ||
        metadata.storageId.slice(0) !== source.approval.sourceDeviceId
      ) {
        failure = "Approved source replica identity changed; refusing native attachment";
        logger?.warn("enrollment source mismatch", { error: failure });
        next.disconnect();
        return;
      }
      verified = true;
      failure = undefined;
      peerCandidate(peerId, metadata);
    };
    next.onError = (event) => {
      const error = "error" in event ? event.error : event;
      failure = `Approved source connection failed: ${String(error)}`;
      logger?.warn("enrollment source transport error", { error: failure });
    };
    const receiveMessage = next.receiveMessage.bind(next);
    next.receiveMessage = (...args) => {
      try {
        receiveMessage(...args);
      } catch (error) {
        failure = `Approved source sent an invalid native message: ${String(error)}`;
        logger?.warn("enrollment source message rejected", { error: failure });
        next.disconnect();
      }
    };
    next.on("peer-disconnected", () => {
      verified = false;
    });
  }
  connect();
  const watchdog = setInterval(() => {
    if (closed || verified || adapter?.socket?.readyState === 0) return;
    // A live handshake gets a bounded opportunity to complete before replacement.
    if (adapter?.socket?.readyState === 1 && !failure && Date.now() - handshakeStartedAt < 10_000)
      return;
    try {
      if (adapter) disposeRemoteSyncAdapter(repo, adapter);
      adapter = null;
      connect();
    } catch (error) {
      failure = `Cannot replace enrollment source adapter: ${String(error)}`;
      logger?.warn("enrollment source reconnect failed", { error: failure });
    }
  }, 2_000);
  watchdog.unref();

  return {
    source,
    async ready(signal) {
      signal?.throwIfAborted();
      if (closed) throw new Error("Enrollment source connection was closed");
      const deadline = Date.now() + 10_000;
      while (!verified) {
        signal?.throwIfAborted();
        if (closed) throw new Error("Enrollment source connection was closed");
        if (failure) throw new Error(failure);
        if (Date.now() >= deadline)
          throw new Error("Approved source did not complete its native handshake within 10000ms");
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    },
    close() {
      if (closed) return;
      closed = true;
      clearInterval(watchdog);
      if (adapter) {
        disposeRemoteSyncAdapter(repo, adapter);
        adapter = null;
      }
    },
  };
}
