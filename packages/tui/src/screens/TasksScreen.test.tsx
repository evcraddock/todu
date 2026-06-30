import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "ink-testing-library";
import type { JSX, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { type TuiToduClient, TuiToduClientError } from "../daemon/todu-client.js";
import { allProjectsFilter } from "../state/project-filter.js";
import { createTuiQueryClient } from "../state/query-client.js";
import { TasksScreen } from "./TasksScreen.js";

function renderWithQuery(children: ReactNode): ReturnType<typeof render> {
  const queryClient = createTuiQueryClient();
  function Wrapper(): JSX.Element {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return render(<Wrapper />);
}

function createTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    title: "First task",
    status: "active",
    priority: "high",
    projectId: "project-1",
    labels: ["tui"],
    assigneeActorIds: [],
    assignees: [],
    createdAt: "2026-06-30T00:00:00.000Z",
    updatedAt: "2026-06-30T00:00:00.000Z",
    ...overrides,
  };
}

function createClient(overrides: Partial<TuiToduClient> = {}): TuiToduClient {
  const tasks = [
    createTask(),
    createTask({ id: "task-2", title: "Second task", status: "waiting", priority: "medium" }),
  ];

  return {
    actor: { list: vi.fn().mockResolvedValue([]) },
    project: {
      list: vi.fn().mockResolvedValue([{ id: "project-1", name: "todu" }]),
      get: vi.fn(),
    },
    task: {
      list: vi.fn().mockResolvedValue(tasks),
      get: vi.fn().mockImplementation((id: string) => {
        const task = tasks.find((entry) => entry.id === id) ?? tasks[0];
        return Promise.resolve({ ...task, description: `Description for ${task.title}` });
      }),
      update: vi.fn().mockImplementation((id: string, input: { status: string }) => {
        const task = tasks.find((entry) => entry.id === id) ?? tasks[0];
        return Promise.resolve({ ...task, status: input.status });
      }),
      createComment: vi.fn(),
    },
    note: { list: vi.fn().mockResolvedValue([]), create: vi.fn() },
    sync: {
      status: vi
        .fn()
        .mockResolvedValue({ local: { mode: "standalone" }, remote: { state: "disconnected" } }),
    },
    ...overrides,
  };
}

async function waitForFrameText(lastFrame: () => string | undefined, text: string): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (lastFrame()?.includes(text)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(`Timed out waiting for frame text: ${text}\nLast frame:\n${lastFrame() ?? ""}`);
}

describe("TasksScreen", () => {
  it("renders fetched tasks and selected task details", async () => {
    const client = createClient();
    const { lastFrame } = renderWithQuery(
      <TasksScreen client={client} projectFilter={allProjectsFilter} />,
    );

    await waitForFrameText(lastFrame, "First task");
    await waitForFrameText(lastFrame, "Description for First task");

    expect(lastFrame()).toContain("Tasks (2)");
    expect(lastFrame()).toContain("> [high] [active] First task (todu) #tui");
    expect(lastFrame()).toContain("Second task");
    expect(lastFrame()).toContain("Detail");
    expect(lastFrame()).toContain("Status: active");
  });

  it("moves selection with j/k and arrow keys and updates detail", async () => {
    const client = createClient();
    const { stdin, lastFrame } = renderWithQuery(
      <TasksScreen client={client} projectFilter={allProjectsFilter} />,
    );

    await waitForFrameText(lastFrame, "Description for First task");

    stdin.write("j");
    await waitForFrameText(lastFrame, "Description for Second task");
    expect(lastFrame()).toContain("> [med] [waiting] Second task (todu) #tui");

    stdin.write("k");
    await waitForFrameText(lastFrame, "Description for First task");
    expect(lastFrame()).toContain("> [high] [active] First task (todu) #tui");

    stdin.write("\u001B[B");
    await waitForFrameText(lastFrame, "Description for Second task");
    expect(lastFrame()).toContain("> [med] [waiting] Second task (todu) #tui");

    stdin.write("\u001B[A");
    await waitForFrameText(lastFrame, "Description for First task");
    expect(lastFrame()).toContain("> [high] [active] First task (todu) #tui");
  });

  it("passes selected project ID to task list filter", async () => {
    const client = createClient();
    renderWithQuery(
      <TasksScreen
        client={client}
        projectFilter={{ projectId: "project-1", projectName: "todu" }}
      />,
    );

    await vi.waitFor(() => {
      expect(client.task.list).toHaveBeenCalledWith({
        status: ["active", "inprogress", "waiting"],
        projectId: "project-1",
      });
    });
  });

  it("updates selected task status without confirmation for non-destructive actions", async () => {
    const client = createClient();
    const { stdin, lastFrame } = renderWithQuery(
      <TasksScreen client={client} projectFilter={allProjectsFilter} />,
    );

    await waitForFrameText(lastFrame, "Description for First task");
    stdin.write("s");

    await waitForFrameText(lastFrame, "Task started: First task");
    expect(client.task.update).toHaveBeenCalledWith("task-1", { status: "inprogress" });
  });

  it("requires confirmation before cancelling a task", async () => {
    const client = createClient();
    const { stdin, lastFrame } = renderWithQuery(
      <TasksScreen client={client} projectFilter={allProjectsFilter} />,
    );

    await waitForFrameText(lastFrame, "Description for First task");
    stdin.write("x");
    await waitForFrameText(lastFrame, "Cancel selected task?");
    expect(client.task.update).not.toHaveBeenCalled();

    stdin.write("y");
    await waitForFrameText(lastFrame, "Task cancelled: First task");
    expect(client.task.update).toHaveBeenCalledWith("task-1", { status: "canceled" });
  });

  it("can dismiss cancellation confirmation", async () => {
    const client = createClient();
    const { stdin, lastFrame } = renderWithQuery(
      <TasksScreen client={client} projectFilter={allProjectsFilter} />,
    );

    await waitForFrameText(lastFrame, "Description for First task");
    stdin.write("x");
    await waitForFrameText(lastFrame, "Cancel selected task?");
    stdin.write("n");
    await waitForFrameText(lastFrame, "Cancelled task action.");
    expect(client.task.update).not.toHaveBeenCalled();
  });

  it("disables status actions while disconnected", async () => {
    const client = createClient();
    const { stdin, lastFrame } = renderWithQuery(
      <TasksScreen
        client={client}
        projectFilter={allProjectsFilter}
        statusActionsEnabled={false}
      />,
    );

    await waitForFrameText(lastFrame, "Description for First task");
    stdin.write("s");
    await waitForFrameText(lastFrame, "Task actions unavailable while daemon is disconnected.");
    expect(client.task.update).not.toHaveBeenCalled();
  });

  it("renders readable mutation errors", async () => {
    const client = createClient();
    vi.mocked(client.task.update).mockRejectedValueOnce(
      new TuiToduClientError({
        method: "task.update",
        code: "VALIDATION_ERROR",
        message: "Cannot update task status",
        userMessage: "Cannot update task status",
      }),
    );
    const { stdin, lastFrame } = renderWithQuery(
      <TasksScreen client={client} projectFilter={allProjectsFilter} />,
    );

    await waitForFrameText(lastFrame, "Description for First task");
    stdin.write("w");
    await waitForFrameText(lastFrame, "Cannot update task status");
  });

  it("renders empty state", async () => {
    const client = createClient({
      task: {
        list: vi.fn().mockResolvedValue([]),
        get: vi.fn(),
        update: vi.fn(),
        createComment: vi.fn(),
      },
    });
    const { lastFrame } = renderWithQuery(
      <TasksScreen client={client} projectFilter={allProjectsFilter} />,
    );

    await waitForFrameText(lastFrame, "No active, in-progress, or waiting tasks for All projects.");
  });

  it("renders user-facing errors", async () => {
    const client = createClient({
      task: {
        list: vi.fn().mockRejectedValue(
          new TuiToduClientError({
            method: "task.list",
            code: "DAEMON_UNAVAILABLE",
            message: "task.list failed (DAEMON_UNAVAILABLE): socket missing",
            userMessage: "Daemon unavailable. Start it with: todu daemon start.",
          }),
        ),
        get: vi.fn(),
        update: vi.fn(),
        createComment: vi.fn(),
      },
    });
    const { lastFrame } = renderWithQuery(
      <TasksScreen client={client} projectFilter={allProjectsFilter} />,
    );

    await waitForFrameText(lastFrame, "Tasks unavailable");
    expect(lastFrame()).toContain("Daemon unavailable. Start it with: todu daemon start.");
  });
});
