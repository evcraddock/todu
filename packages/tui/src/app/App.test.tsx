import { Text } from "ink";
import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";
import { AppFrame } from "../components/AppFrame.js";
import type {
  DaemonConnection,
  DaemonConnectionListener,
  DaemonConnectionSnapshot,
  DaemonEventFrame,
  DaemonEventListener,
} from "../daemon/connection.js";
import type { TuiToduClient } from "../daemon/todu-client.js";
import { allProjectsFilter } from "../state/project-filter.js";
import { App } from "./App.js";
import { applyNavigationAction, createInitialRouteState } from "./keymap.js";

class FakeConnection implements DaemonConnection {
  readonly start = vi.fn();
  readonly stop = vi.fn();
  readonly request = vi.fn().mockResolvedValue({ ok: true, value: { subscribed: [] } });
  private snapshot: DaemonConnectionSnapshot;
  private readonly listeners = new Set<DaemonConnectionListener>();
  private readonly eventListeners = new Set<DaemonEventListener>();

  constructor(snapshot: DaemonConnectionSnapshot) {
    this.snapshot = snapshot;
  }

  getSnapshot(): DaemonConnectionSnapshot {
    return this.snapshot;
  }

  subscribe(listener: DaemonConnectionListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribeEvents(listener: DaemonEventListener): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  emitSnapshot(snapshot: DaemonConnectionSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  emitEvent(event: DaemonEventFrame): void {
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }
}

function createFakeConnection(snapshot: DaemonConnectionSnapshot): FakeConnection {
  return new FakeConnection(snapshot);
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

function createFakeTask() {
  return {
    id: "task-1",
    title: "Ship",
    status: "active",
    priority: "high",
    projectId: "project-1",
    labels: ["tui"],
    assigneeActorIds: [],
    assignees: [],
    createdAt: "2026-06-30T00:00:00.000Z",
    updatedAt: "2026-06-30T00:00:00.000Z",
  };
}

function createFakeClient(): TuiToduClient {
  const task = createFakeTask();
  return {
    actor: { list: vi.fn().mockResolvedValue([]) },
    project: {
      list: vi.fn().mockResolvedValue([
        {
          id: "project-1",
          name: "Inbox",
          description: "Default project",
          status: "active",
          priority: "medium",
          authorizedAssigneeActorIds: [],
          createdAt: "2026-06-30T00:00:00.000Z",
          updatedAt: "2026-06-30T00:00:00.000Z",
        },
      ]),
      get: vi.fn(),
    },
    task: {
      list: vi.fn().mockResolvedValue([task]),
      get: vi.fn().mockResolvedValue({ ...task, description: "Ship details" }),
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

    const { lastFrame } = render(<App connection={connection} toduClient={createFakeClient()} />);

    expect(lastFrame()).toContain("Todu • Tasks");
    expect(lastFrame()).toContain("View: Tasks");
    expect(lastFrame()).toContain("Daemon unavailable");
    expect(lastFrame()).toContain("todu daemon start");
    expect(lastFrame()).toContain("1 Tasks");
    expect(lastFrame()).toContain("q Back/Quit");
    expect(lastFrame()).toContain("Project: All projects");
  });

  it("switches between primary routes", async () => {
    const { stdin, lastFrame } = render(
      <App
        connection={createFakeConnection(createConnectedSnapshot())}
        toduClient={createFakeClient()}
      />,
    );

    await waitForFrameText(lastFrame, "Ship");
    expect(lastFrame()).toContain("Tasks");

    stdin.write("2");
    await waitForFrameText(lastFrame, "Project detail");
    expect(lastFrame()).toContain("View: Projects");

    stdin.write("3");
    await waitForFrameText(lastFrame, "Data status ready");
    expect(lastFrame()).toContain("Projects: 1");
    expect(lastFrame()).toContain("Tasks: 1");
  });

  it("selects a project and filters Tasks", async () => {
    const client = createFakeClient();
    const { stdin, lastFrame } = render(
      <App connection={createFakeConnection(createConnectedSnapshot())} toduClient={client} />,
    );

    await waitForFrameText(lastFrame, "Ship");
    stdin.write("2");
    await waitForFrameText(lastFrame, "Project detail");
    stdin.write("j");
    await waitForFrameText(lastFrame, "Default project");
    stdin.write("\r");
    await waitForFrameText(lastFrame, "Project: Inbox");

    await vi.waitFor(() => {
      expect(client.task.list).toHaveBeenCalledWith({
        status: ["active", "inprogress", "waiting"],
        projectId: "project-1",
      });
    });
  });

  it("clears project filter from Projects with a", async () => {
    const { stdin, lastFrame } = render(
      <App
        connection={createFakeConnection(createConnectedSnapshot())}
        toduClient={createFakeClient()}
      />,
    );

    await waitForFrameText(lastFrame, "Ship");
    stdin.write("2");
    await waitForFrameText(lastFrame, "Project detail");
    stdin.write("j");
    await waitForFrameText(lastFrame, "Default project");
    stdin.write("\r");
    await waitForFrameText(lastFrame, "Project: Inbox");

    stdin.write("2");
    await waitForFrameText(lastFrame, "Project detail");
    stdin.write("a");
    await waitForFrameText(lastFrame, "Project: All projects");
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
    expect(lastFrame()).toContain("j/↓    Down");
    expect(lastFrame()).toContain("Enter  Select Project");
    expect(lastFrame()).toContain("a      All Projects");
    expect(lastFrame()).toContain("c      Comment");
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
    await waitForFrameText(lastFrame, "Project detail");
    stdin.write("?");
    await waitForFrameText(lastFrame, "Help");

    stdin.write("q");
    await waitForFrameText(lastFrame, "Project detail");
    expect(onExit).not.toHaveBeenCalled();

    stdin.write("q");
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("refetches active task data when data.changed is received", async () => {
    const connection = createFakeConnection(createConnectedSnapshot());
    const client = createFakeClient();
    render(<App connection={connection} toduClient={client} />);

    await vi.waitFor(() => {
      expect(client.task.list).toHaveBeenCalledTimes(1);
    });
    await vi.waitFor(() => {
      expect(connection.request).toHaveBeenCalledWith("events.subscribe", {
        events: ["data.changed", "sync.statusChanged"],
      });
    });

    connection.emitEvent({ event: "data.changed", payload: { type: "catalog" } });

    await vi.waitFor(() => {
      expect(client.task.list).toHaveBeenCalledTimes(2);
    });
  });

  it("updates sync status line from sync.statusChanged without a full app refresh", async () => {
    const connection = createFakeConnection(createConnectedSnapshot());
    const { lastFrame } = render(<App connection={connection} toduClient={createFakeClient()} />);

    await waitForFrameText(lastFrame, "Ship");
    connection.emitEvent({
      event: "sync.statusChanged",
      payload: { local: { mode: "standalone" }, remote: { state: "connected" } },
    });

    await waitForFrameText(lastFrame, "Sync: connected");
  });

  it("resubscribes and keeps task data visible across reconnect", async () => {
    const connection = createFakeConnection(createConnectedSnapshot());
    const { lastFrame } = render(<App connection={connection} toduClient={createFakeClient()} />);

    await waitForFrameText(lastFrame, "Ship");
    await vi.waitFor(() => {
      expect(connection.request).toHaveBeenCalledTimes(1);
    });

    connection.emitSnapshot({ ...createConnectedSnapshot(), state: "reconnecting", hello: null });
    await waitForFrameText(lastFrame, "Daemon disconnected; reconnecting");
    expect(lastFrame()).toContain("Ship");

    connection.emitSnapshot(createConnectedSnapshot());

    await vi.waitFor(() => {
      expect(connection.request).toHaveBeenCalledTimes(2);
    });
    expect(connection.request).toHaveBeenLastCalledWith("events.subscribe", {
      events: ["data.changed", "sync.statusChanged"],
    });
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
      <AppFrame
        route="data-status"
        connection={createConnectedSnapshot()}
        projectFilter={allProjectsFilter}
        terminalWidth={24}
      >
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
