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
  const comments = [
    {
      id: "note-1",
      content: "Existing comment",
      author: "Erik",
      entityType: "task",
      entityId: "task-1",
      tags: [],
      createdAt: "2026-06-30T00:01:00.000Z",
    },
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
      createComment: vi.fn().mockImplementation((taskId: string, content: string) => {
        const note = {
          id: `note-${comments.length + 1}`,
          content,
          author: "Erik",
          entityType: "task",
          entityId: taskId,
          tags: [],
          createdAt: "2026-06-30T00:02:00.000Z",
        };
        comments.push(note);
        return Promise.resolve(note);
      }),
    },
    note: {
      list: vi
        .fn()
        .mockImplementation((filter: { entityId?: string } = {}) =>
          Promise.resolve(comments.filter((comment) => comment.entityId === filter.entityId)),
        ),
      create: vi.fn(),
    },
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
  it("renders fetched tasks without task details until enter opens detail mode", async () => {
    const client = createClient();
    const { stdin, lastFrame } = renderWithQuery(
      <TasksScreen client={client} projectFilter={allProjectsFilter} />,
    );

    await waitForFrameText(lastFrame, "First task");

    expect(lastFrame()).toContain("┌");
    expect(lastFrame()).toContain("└");
    expect(lastFrame()).toContain("Projects");
    expect(lastFrame()).toContain("> All Projects");
    expect(lastFrame()).toContain("Tasks (2)");
    expect(lastFrame()).toContain("First task");
    expect(lastFrame()).toContain("Second task");
    expect(lastFrame()).not.toContain("Detail");

    stdin.write("\r");
    await waitForFrameText(lastFrame, "Existing comment");

    expect(lastFrame()).toContain("Task detail");
    expect(lastFrame()).toContain("active • high • todu • #tui");
    expect(lastFrame()).toContain("Existing comment");
    expect(lastFrame()).not.toContain("Second task");

    stdin.write("\u001B");
    await waitForFrameText(lastFrame, "Second task");
    expect(lastFrame()).not.toContain("Detail");
  });

  it("moves task selection with j/k and arrow keys", async () => {
    const client = createClient();
    const { stdin, lastFrame } = renderWithQuery(
      <TasksScreen client={client} projectFilter={allProjectsFilter} />,
    );

    await waitForFrameText(lastFrame, "First task");

    stdin.write("j");
    await waitForFrameText(lastFrame, "Second task");
    expect(lastFrame()).toContain("Second task");

    stdin.write("k");
    await waitForFrameText(lastFrame, "First task");
    expect(lastFrame()).toContain("First task");

    stdin.write("\u001B[B");
    await waitForFrameText(lastFrame, "Second task");
    expect(lastFrame()).toContain("Second task");

    stdin.write("\u001B[A");
    await waitForFrameText(lastFrame, "First task");
    expect(lastFrame()).toContain("First task");
  });

  it("filters tasks from the permanent project pane", async () => {
    const inboxTask = createTask({ id: "task-inbox", title: "Inbox task", projectId: "project-1" });
    const workTask = createTask({ id: "task-work", title: "Work task", projectId: "project-2" });
    const client = createClient({
      project: {
        list: vi.fn().mockResolvedValue([
          { id: "project-1", name: "todu" },
          { id: "project-2", name: "Work" },
        ]),
        get: vi.fn(),
      },
      task: {
        list: vi.fn().mockImplementation((filter: { projectId?: string } = {}) => {
          const tasks = [inboxTask, workTask];
          return Promise.resolve(
            filter.projectId ? tasks.filter((task) => task.projectId === filter.projectId) : tasks,
          );
        }),
        get: vi.fn().mockImplementation((id: string) => {
          const task = [inboxTask, workTask].find((entry) => entry.id === id) ?? inboxTask;
          return Promise.resolve({ ...task, description: `Description for ${task.title}` });
        }),
        update: vi.fn(),
        createComment: vi.fn(),
      },
    });
    const { stdin, lastFrame } = renderWithQuery(
      <TasksScreen client={client} projectFilter={allProjectsFilter} />,
    );

    await waitForFrameText(lastFrame, "Inbox task");
    expect(lastFrame()).toContain("Work task");

    stdin.write("h");
    await new Promise((resolve) => setTimeout(resolve, 10));
    stdin.write("j");
    await new Promise((resolve) => setTimeout(resolve, 10));
    stdin.write("j");

    await waitForFrameText(lastFrame, "Work task");
    expect(lastFrame()).toContain("Work task");
    expect(lastFrame()).not.toContain("Inbox task");
    expect(client.task.list).toHaveBeenCalledWith({
      status: ["active", "inprogress", "waiting"],
      projectId: "project-2",
    });

    stdin.write("\r");
    await new Promise((resolve) => setTimeout(resolve, 10));
    stdin.write("j");
    await waitForFrameText(lastFrame, "Work task");

    stdin.write("l");
    await new Promise((resolve) => setTimeout(resolve, 10));
    stdin.write("k");
    await waitForFrameText(lastFrame, "Work task");
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

    await waitForFrameText(lastFrame, "First task");
    stdin.write("s");

    await waitForFrameText(lastFrame, "Task started: First task");
    expect(client.task.update).toHaveBeenCalledWith("task-1", { status: "inprogress" });
  });

  it("requires confirmation before cancelling a task", async () => {
    const client = createClient();
    const { stdin, lastFrame } = renderWithQuery(
      <TasksScreen client={client} projectFilter={allProjectsFilter} />,
    );

    await waitForFrameText(lastFrame, "First task");
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

    await waitForFrameText(lastFrame, "First task");
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

    await waitForFrameText(lastFrame, "First task");
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

    await waitForFrameText(lastFrame, "First task");
    stdin.write("w");
    await waitForFrameText(lastFrame, "Cannot update task status");
  });

  it("launches the comment editor and submits its non-empty content", async () => {
    const client = createClient();
    const composeComment = vi.fn().mockReturnValue("New task context");
    const { stdin, lastFrame } = renderWithQuery(
      <TasksScreen
        client={client}
        projectFilter={allProjectsFilter}
        composeComment={composeComment}
      />,
    );

    await waitForFrameText(lastFrame, "First task");
    stdin.write("c");

    await waitForFrameText(lastFrame, "Comment added: First task");
    expect(composeComment).toHaveBeenCalledOnce();
    expect(client.task.createComment).toHaveBeenCalledWith("task-1", "New task context");
  });

  it("treats empty editor content as cancellation without sending a mutation", async () => {
    const client = createClient();
    const { stdin, lastFrame } = renderWithQuery(
      <TasksScreen
        client={client}
        projectFilter={allProjectsFilter}
        composeComment={() => "   "}
      />,
    );

    await waitForFrameText(lastFrame, "First task");
    stdin.write("c");

    await waitForFrameText(lastFrame, "Cancelled comment.");
    expect(client.task.createComment).not.toHaveBeenCalled();
  });

  it("reports comment action unavailable when no task is selected", async () => {
    const client = createClient({
      task: {
        list: vi.fn().mockResolvedValue([]),
        get: vi.fn(),
        update: vi.fn(),
        createComment: vi.fn(),
      },
    });
    const composeComment = vi.fn();
    const { stdin, lastFrame } = renderWithQuery(
      <TasksScreen
        client={client}
        projectFilter={allProjectsFilter}
        composeComment={composeComment}
      />,
    );

    await waitForFrameText(lastFrame, "No active, in-progress, or waiting");
    stdin.write("c");

    await waitForFrameText(lastFrame, "No task selected for comment.");
    expect(composeComment).not.toHaveBeenCalled();
    expect(client.task.createComment).not.toHaveBeenCalled();
  });

  it("disables comment action while disconnected", async () => {
    const client = createClient();
    const { stdin, lastFrame } = renderWithQuery(
      <TasksScreen
        client={client}
        projectFilter={allProjectsFilter}
        statusActionsEnabled={false}
        composeComment={vi.fn()}
      />,
    );

    await waitForFrameText(lastFrame, "First task");
    stdin.write("c");

    await waitForFrameText(lastFrame, "Task actions unavailable while daemon is disconnected.");
    expect(client.task.createComment).not.toHaveBeenCalled();
  });

  it("renders clear comment editor launch errors", async () => {
    const client = createClient();
    const { stdin, lastFrame } = renderWithQuery(
      <TasksScreen
        client={client}
        projectFilter={allProjectsFilter}
        composeComment={() => {
          throw new Error('Failed to launch terminal editor "missing-editor": command not found');
        }}
      />,
    );

    await waitForFrameText(lastFrame, "First task");
    stdin.write("c");

    await waitForFrameText(lastFrame, "Failed to launch terminal editor");
    expect(client.task.createComment).not.toHaveBeenCalled();
  });

  it("renders readable comment mutation errors", async () => {
    const client = createClient();
    vi.mocked(client.task.createComment).mockRejectedValueOnce(
      new TuiToduClientError({
        method: "note.create",
        code: "VALIDATION_ERROR",
        message: "Cannot add comment",
        userMessage: "Cannot add comment",
      }),
    );
    const { stdin, lastFrame } = renderWithQuery(
      <TasksScreen
        client={client}
        projectFilter={allProjectsFilter}
        composeComment={() => "New task context"}
      />,
    );

    await waitForFrameText(lastFrame, "First task");
    stdin.write("c");

    await waitForFrameText(lastFrame, "Cannot add comment");
  });

  it("renders loading state inside the pane layout", async () => {
    const client = createClient({
      task: {
        list: vi.fn().mockImplementation(() => new Promise(() => {})),
        get: vi.fn(),
        update: vi.fn(),
        createComment: vi.fn(),
      },
    });
    const { lastFrame } = renderWithQuery(
      <TasksScreen client={client} projectFilter={allProjectsFilter} />,
    );

    await waitForFrameText(lastFrame, "Tasks • loading…");
    expect(lastFrame()).toContain("┌");
    expect(lastFrame()).toContain("Projects");
    expect(lastFrame()).toContain("Loading active, in-progress, and waiting tasks…");
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

    await waitForFrameText(lastFrame, "No active, in-progress, or waiting");
    expect(lastFrame()).toContain("┌");
    expect(lastFrame()).toContain("Tasks (0)");
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
    expect(lastFrame()).toContain("┌");
    expect(lastFrame()).toContain("Projects");
    expect(lastFrame()).toContain("Daemon unavailable. Start it with: todu daemon start.");
  });
});
