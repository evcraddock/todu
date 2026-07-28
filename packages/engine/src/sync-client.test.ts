import type { Repo } from "@automerge/automerge-repo";
import { WebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import { describe, expect, it, vi } from "vitest";
import { disposeRemoteSyncAdapter, hardenWebSocketClientAdapterErrors } from "./sync-client.js";

interface FakeSocket {
  on(event: "error", listener: (error: unknown) => void): void;
}

describe("hardenWebSocketClientAdapterErrors", () => {
  it("swallows transient socket errors", () => {
    const adapter = new WebSocketClientAdapter("ws://localhost:1");
    hardenWebSocketClientAdapterErrors(adapter);

    expect(() => {
      adapter.onError({
        error: {
          code: "ECONNRESET",
        },
      } as unknown as Parameters<WebSocketClientAdapter["onError"]>[0]);
    }).not.toThrow();
  });

  it("swallows connection-failed errors without a code", () => {
    const adapter = new WebSocketClientAdapter("ws://localhost:1");
    hardenWebSocketClientAdapterErrors(adapter);

    expect(() => {
      adapter.onError({
        error: {
          message: "WebSocket connection to 'ws://localhost:1/' failed: Failed to connect",
        },
      } as unknown as Parameters<WebSocketClientAdapter["onError"]>[0]);
    }).not.toThrow();
  });

  it("rethrows non-transient errors", () => {
    const adapter = new WebSocketClientAdapter("ws://localhost:1");
    hardenWebSocketClientAdapterErrors(adapter);

    expect(() => {
      adapter.onError({
        error: {
          code: "EPERM",
        },
      } as unknown as Parameters<WebSocketClientAdapter["onError"]>[0]);
    }).toThrow();
  });

  it("disposes adapters before replacement", () => {
    const adapter = new WebSocketClientAdapter("ws://localhost:1", 0);
    hardenWebSocketClientAdapterErrors(adapter);
    const peerCandidate = vi.fn();
    const message = vi.fn();
    adapter.on("peer-candidate", peerCandidate);
    adapter.on("message", message);

    const removeNetworkAdapter = vi.fn((candidate: WebSocketClientAdapter) => {
      candidate.disconnect();
    });
    const repo = {
      networkSubsystem: { removeNetworkAdapter },
    } as unknown as Repo;

    disposeRemoteSyncAdapter(repo, adapter);

    expect(removeNetworkAdapter).toHaveBeenCalledWith(adapter);
    expect(adapter.socket).toBeUndefined();
    expect(adapter.eventNames()).toEqual([]);
  });

  it("leaves reconnect ownership to the watchdog after a socket closes", () => {
    vi.useFakeTimers();
    try {
      const adapter = new WebSocketClientAdapter("ws://localhost:1", 25);
      adapter.peerId = "local-peer" as typeof adapter.peerId;
      hardenWebSocketClientAdapterErrors(adapter, undefined, { watchdogOwnsReconnect: true });
      const connectSpy = vi.spyOn(adapter, "connect");

      adapter.onClose();
      vi.advanceTimersByTime(25);

      expect(connectSpy).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports adapter disposal failures with server context", () => {
    const adapter = new WebSocketClientAdapter("wss://sync.example.test", 0);
    const repo = {
      networkSubsystem: {
        removeNetworkAdapter: () => {
          throw new Error("teardown failed");
        },
      },
    } as unknown as Repo;

    expect(() => disposeRemoteSyncAdapter(repo, adapter)).toThrow(
      "Failed to dispose remote sync adapter for wss://sync.example.test: teardown failed",
    );
  });

  it("attaches a socket error listener on each connection", () => {
    const adapter = new WebSocketClientAdapter("ws://localhost:1");
    const errorListeners: Array<(error: unknown) => void> = [];
    const fakeSocket: FakeSocket = {
      on(event, listener) {
        if (event === "error") {
          errorListeners.push(listener);
        }
      },
    };

    adapter.connect = ((peerId, peerMetadata) => {
      void peerId;
      void peerMetadata;
      adapter.socket = fakeSocket as unknown as WebSocketClientAdapter["socket"];
    }) as WebSocketClientAdapter["connect"];

    hardenWebSocketClientAdapterErrors(adapter);
    adapter.connect("peer-id", {});

    expect(errorListeners).toHaveLength(1);
    expect(() => {
      errorListeners[0]?.(new Error("read ECONNRESET"));
    }).not.toThrow();
  });
});
