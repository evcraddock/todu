import { EventEmitter } from "node:events";
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

  it("disposes adapters before connection initialization", () => {
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

  it("drops messages and disconnects the peer while the remote socket is closing", () => {
    const adapter = new WebSocketClientAdapter("ws://localhost:1", 25);
    const peerDisconnected = vi.fn();
    const logger = { warn: vi.fn() };
    adapter.remotePeerId = "remote-peer" as typeof adapter.remotePeerId;
    adapter.socket = {
      OPEN: 1,
      readyState: 2,
    } as WebSocketClientAdapter["socket"];
    adapter.on("peer-disconnected", peerDisconnected);
    hardenWebSocketClientAdapterErrors(adapter, logger, { watchdogOwnsReconnect: true });

    expect(() => {
      adapter.send({} as Parameters<WebSocketClientAdapter["send"]>[0]);
    }).not.toThrow();
    expect(peerDisconnected).toHaveBeenCalledWith({ peerId: "remote-peer" });
    expect(adapter.remotePeerId).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      "remote sync adapter skipped message while socket not ready",
      { readyState: 2 },
    );
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

  it("retires each superseded Node socket and prevents connection reuse after disconnect", () => {
    const adapter = new WebSocketClientAdapter("ws://localhost:1");
    const previous = { on: vi.fn(), removeEventListener: vi.fn(), terminate: vi.fn() };
    const current = { on: vi.fn(), removeEventListener: vi.fn(), terminate: vi.fn() };
    adapter.socket = previous as unknown as WebSocketClientAdapter["socket"];
    const connect = vi.fn(() => {
      adapter.socket = current as unknown as WebSocketClientAdapter["socket"];
    });
    adapter.connect = connect;
    adapter.disconnect = () => {
      adapter.socket = undefined;
    };
    hardenWebSocketClientAdapterErrors(adapter);
    adapter.connect("local-peer", {});
    expect(previous.terminate).toHaveBeenCalledOnce();
    expect(current.terminate).not.toHaveBeenCalled();
    adapter.disconnect();
    adapter.disconnect();
    expect(current.terminate).toHaveBeenCalledOnce();
    adapter.connect("local-peer", {});
    expect(connect).toHaveBeenCalledOnce();
  });

  it("cleans heartbeat timers when a socket is replaced or its adapter is disposed", () => {
    vi.useFakeTimers();
    try {
      const socket = () =>
        Object.assign(new EventEmitter(), {
          OPEN: 1,
          readyState: 1,
          ping: vi.fn(),
          terminate: vi.fn(),
          removeEventListener: vi.fn(),
        });
      const previous = socket();
      const current = socket();
      const adapter = new WebSocketClientAdapter("ws://localhost:1");
      adapter.socket = previous as unknown as WebSocketClientAdapter["socket"];
      adapter.connect = () => {
        adapter.socket = current as unknown as WebSocketClientAdapter["socket"];
      };
      adapter.disconnect = () => {
        adapter.socket = undefined;
      };
      hardenWebSocketClientAdapterErrors(adapter);
      adapter.connect("local-peer", {});
      vi.advanceTimersByTime(5_000);
      expect(previous.ping).not.toHaveBeenCalled();
      expect(previous.terminate).toHaveBeenCalledOnce();
      expect(current.ping).toHaveBeenCalledOnce();
      adapter.disconnect();
      expect(current.terminate).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
      vi.advanceTimersByTime(20_000);
      expect(current.ping).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("closes sockets without a Node termination method", () => {
    const adapter = new WebSocketClientAdapter("ws://localhost:1");
    const socket = { on: vi.fn(), removeEventListener: vi.fn(), close: vi.fn() };
    adapter.socket = socket as unknown as WebSocketClientAdapter["socket"];
    adapter.disconnect = () => {
      adapter.socket = undefined;
    };
    hardenWebSocketClientAdapterErrors(adapter);
    adapter.disconnect();
    expect(socket.close).toHaveBeenCalledOnce();
  });

  it("surfaces socket retirement failures instead of claiming cleanup completed", () => {
    const adapter = new WebSocketClientAdapter("ws://localhost:1");
    const socket = {
      on: vi.fn(),
      removeEventListener: vi.fn(),
      terminate: () => {
        throw new Error("retirement failed");
      },
    };
    adapter.socket = socket as unknown as WebSocketClientAdapter["socket"];
    adapter.disconnect = () => {
      adapter.socket = undefined;
    };
    hardenWebSocketClientAdapterErrors(adapter);
    expect(() => adapter.disconnect()).toThrow("retirement failed");
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
