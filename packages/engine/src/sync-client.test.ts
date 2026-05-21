import { WebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import { describe, expect, it } from "vitest";
import { hardenWebSocketClientAdapterErrors } from "./sync-client.js";

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
