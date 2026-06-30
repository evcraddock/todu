import { Text } from "ink";
import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";
import { AppFrame } from "../components/AppFrame.js";
import type {
  DaemonConnection,
  DaemonConnectionListener,
  DaemonConnectionSnapshot,
} from "../daemon/connection.js";
import type { TuiToduClient } from "../daemon/todu-client.js";
import { App } from "./App.js";
import { applyNavigationAction, createInitialRouteState } from "./keymap.js";

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

function createConnectedSnapshot(): DaemonConnectionSnapshot {
  return {
    state: "connected",
    socketPath: "/tmp/todu.sock",
    hello: {
      protocolVersion: 1,
      daemonVersion: "dev",
      pid: 123,
      capabilities: [],
    },
    error: null,
    reconnectAttempt: 0,
    reconnectDelayMs: null,
  };
}

function createFailedSnapshot(): DaemonConnectionSnapshot {
  return {
    state: "failed",
    socketPath: "/tmp/todu.sock",
    hello: null,
    error: {
      code: "DAEMON_UNAVAILABLE",
      message: "Daemon unavailable at socket: /tmp/todu.sock",
    },
    reconnectAttempt: 1,
    reconnectDelayMs: 250,
  };
}

function createFakeClient(): TuiToduClient {
  return {
    actor: { list: vi.fn().mockResolvedValue([]) },
    project: {
      list: vi.fn().mockResolvedValue([{ id: "project-1", name: "Inbox" }]),
      get: vi.fn(),
    },
    task: {
      list: vi.fn().mockResolvedValue([{ id: "task-1", title: "Ship" }]),
      get: vi.fn(),
      update: vi.fn(),
      createComment: vi.fn(),
    },
    note: { list: vi.fn().mockResolvedValue([]), create: vi.fn() },
    sync: {
      status: vi
        .fn()
        .mockResolvedValue({ local: { mode: "standalone" }, remote: { state: "disconnected" } }),
    },
  };
}

async function waitForFrameText(lastFrame: () => string | undefined, text: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (lastFrame()?.includes(text)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(`Timed out waiting for frame text: ${text}\nLast frame:\n${lastFrame() ?? ""}`);
}

describe("App", () => {
  it("renders the initial TUI shell with daemon connection guidance", () => {
    const connection = createFakeConnection(createFailedSnapshot());

    const { lastFrame } = render(<App connection={connection} />);

    expect(lastFrame()).toContain("Todu • Tasks");
    expect(lastFrame()).toContain("View: Tasks");
    expect(lastFrame()).toContain("Daemon unavailable");
    expect(lastFrame()).toContain("todu daemon start");
    expect(lastFrame()).toContain("1 Tasks");
    expect(lastFrame()).toContain("q Back/Quit");
  });

  it("switches between primary routes", async () => {
    const { stdin, lastFrame } = render(
      <App
        connection={createFakeConnection(createConnectedSnapshot())}
        toduClient={createFakeClient()}
      />,
    );

    expect(lastFrame()).toContain("Tasks");
    expect(lastFrame()).toContain("Task list placeholder.");

    stdin.write("2");
    await waitForFrameText(lastFrame, "Projects placeholder.");
    expect(lastFrame()).toContain("View: Projects");

    stdin.write("3");
    await waitForFrameText(lastFrame, "Data status ready");
    expect(lastFrame()).toContain("Projects: 1");
    expect(lastFrame()).toContain("Tasks: 1");
  });

  it("shows help with implemented keys", async () => {
    const { stdin, lastFrame } = render(
      <App
        connection={createFakeConnection(createConnectedSnapshot())}
        toduClient={createFakeClient()}
      />,
    );

    stdin.write("?");
    await waitForFrameText(lastFrame, "Help");

    expect(lastFrame()).toContain("1      Tasks");
    expect(lastFrame()).toContain("2      Projects");
    expect(lastFrame()).toContain("3      Data Status");
    expect(lastFrame()).toContain("?      Help");
    expect(lastFrame()).toContain("q      Back/Quit");
    expect(lastFrame()).toContain("Ctrl+C Quit");
  });

  it("backs out of help before quitting from a root route", async () => {
    const onExit = vi.fn();
    const { stdin, lastFrame } = render(
      <App
        connection={createFakeConnection(createConnectedSnapshot())}
        toduClient={createFakeClient()}
        onExit={onExit}
      />,
    );

    stdin.write("2");
    await waitForFrameText(lastFrame, "Projects placeholder.");
    stdin.write("?");
    await waitForFrameText(lastFrame, "Help");

    stdin.write("q");
    await waitForFrameText(lastFrame, "Projects placeholder.");
    expect(onExit).not.toHaveBeenCalled();

    stdin.write("q");
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("keeps quit behavior deterministic in the route reducer", () => {
    const state = createInitialRouteState();

    expect(applyNavigationAction(state, { type: "back-or-quit" })).toBe("quit");
    expect(
      applyNavigationAction({ route: "help", previousRoute: "projects" }, { type: "back-or-quit" }),
    ).toEqual({ route: "projects", previousRoute: "projects" });
  });

  it("renders the frame at narrow widths without wrapping route labels into exceptions", () => {
    const { lastFrame } = render(
      <AppFrame route="data-status" connection={createConnectedSnapshot()} terminalWidth={24}>
        <TextFixture />
      </AppFrame>,
    );

    expect(lastFrame()).toContain("Todu");
    expect(lastFrame()).toContain("View: Data Status");
    expect(lastFrame()).toContain("fixture");
  });
});

function TextFixture() {
  return <Text>fixture</Text>;
}
