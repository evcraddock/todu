import { WebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import { describe, expect, it } from "vitest";
import { hardenWebSocketClientAdapterErrors } from "./sync-client.js";

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
});
