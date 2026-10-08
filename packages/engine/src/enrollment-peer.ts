import type { Repo } from "@automerge/automerge-repo/slim";
import type { WebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import type { EnrollmentApproval } from "@todu/core";
import { assertNativePeerIdentity } from "./peer-identity.js";
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
  isClosed?(): boolean;
  /** A roster role borrowing the configured server's adapter. */
  serverBacked?: boolean;
  /** Independent lifetime for another role sharing this native channel. */
  retain?(): EnrollmentPeerConnection;
  getAdapter?(): WebSocketClientAdapter | null;
}
export function enrollmentSyncUrl(source: EnrollmentSource): string {
  const url = new URL(source.approval.syncPath, source.endpoint);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.href;
}

/** Identity-checked native transport reused by enrollment and explicit roster snapshots. */
export function createEnrollmentPeerConnection(options: {
  repo: Repo;
  source: EnrollmentSource;
  logger?: SyncAdapterEventLogger;
  /** Transfer an existing channel without opening a competing socket. */
  adapter?: WebSocketClientAdapter;
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
    const next =
      options.adapter ?? addRemoteSyncAdapter(repo, enrollmentSyncUrl(source), 2_000, logger);
    const storageId = next.remotePeerId
      ? repo.getStorageIdOfPeer(next.remotePeerId)?.slice(0)
      : undefined;
    if (options.adapter && storageId && next.remotePeerId) {
      if (storageId !== source.approval.sourceDeviceId)
        throw new Error("Configured server is not the selected native source");
      assertNativePeerIdentity({
        repo,
        localId: source.approval.deviceId,
        peerId: next.remotePeerId,
        storageId,
      });
    }
    options.adapter = undefined;
    adapter = next;
    verified = storageId === source.approval.sourceDeviceId;
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
      try {
        assertNativePeerIdentity({
          repo,
          localId: source.approval.deviceId,
          peerId,
          storageId: metadata.storageId,
        });
      } catch (error) {
        failure = String(error);
        logger?.warn("native peer identity refused", { error: failure });
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

  let references = 0;
  function lease(): EnrollmentPeerConnection {
    references++;
    let released = false;
    return {
      source,
      isClosed: () => closed || released,
      getAdapter: () => (released ? null : adapter),
      retain() {
        if (closed || released) throw new Error("Cannot retain a closed native peer channel");
        return lease();
      },
      async ready(signal) {
        signal?.throwIfAborted();
        if (closed || released) throw new Error("Enrollment source connection was closed");
        const deadline = Date.now() + 10_000;
        while (!verified) {
          signal?.throwIfAborted();
          if (closed || released) throw new Error("Enrollment source connection was closed");
          if (failure) throw new Error(failure);
          if (Date.now() >= deadline)
            throw new Error("Approved source did not complete its native handshake within 10000ms");
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
      },
      close() {
        if (released) return;
        released = true;
        if (--references > 0 || closed) return;
        closed = true;
        clearInterval(watchdog);
        if (adapter) {
          disposeRemoteSyncAdapter(repo, adapter);
          adapter = null;
        }
      },
    };
  }
  return lease();
}
