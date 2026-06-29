import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";
import type {
  DaemonConnection,
  DaemonConnectionListener,
  DaemonConnectionSnapshot,
} from "../daemon/connection.js";
import { App } from "./App.js";

function createFakeConnection(snapshot: DaemonConnectionSnapshot): DaemonConnection {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    getSnapshot: () => snapshot,
    subscribe: (listener: DaemonConnectionListener) => {
      listener(snapshot);
      return vi.fn();
    },
    request: vi.fn(),
  };
}

describe("App", () => {
  it("renders the initial TUI shell with daemon connection guidance", () => {
    const connection = createFakeConnection({
      state: "failed",
      socketPath: "/tmp/todu.sock",
      hello: null,
      error: {
        code: "DAEMON_UNAVAILABLE",
        message: "Daemon unavailable at socket: /tmp/todu.sock",
      },
      reconnectAttempt: 1,
      reconnectDelayMs: 250,
    });

    const { lastFrame } = render(<App connection={connection} />);

    expect(lastFrame()).toContain("todu TUI");
    expect(lastFrame()).toContain("Daemon unavailable");
    expect(lastFrame()).toContain("todu daemon start");
    expect(lastFrame()).toContain("Press q or Ctrl+C to quit.");
  });
});
