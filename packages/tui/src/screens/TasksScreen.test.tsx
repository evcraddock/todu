import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "ink-testing-library";
import type { JSX, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { type TuiToduClient, TuiToduClientError } from "../daemon/todu-client.js";
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
      update: vi.fn(),
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
    const { lastFrame } = renderWithQuery(<TasksScreen client={client} />);

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
    const { stdin, lastFrame } = renderWithQuery(<TasksScreen client={client} />);

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

  it("renders empty state", async () => {
    const client = createClient({
      task: {
        list: vi.fn().mockResolvedValue([]),
        get: vi.fn(),
        update: vi.fn(),
        createComment: vi.fn(),
      },
    });
    const { lastFrame } = renderWithQuery(<TasksScreen client={client} />);

    await waitForFrameText(lastFrame, "No active, in-progress, or waiting tasks.");
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
    const { lastFrame } = renderWithQuery(<TasksScreen client={client} />);

    await waitForFrameText(lastFrame, "Tasks unavailable");
    expect(lastFrame()).toContain("Daemon unavailable. Start it with: todu daemon start.");
  });
});
