import { QueryClientProvider } from "@tanstack/react-query";
import type { Task } from "@todu/core";
import { render } from "ink-testing-library";
import type { JSX, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { TuiToduClient } from "../daemon/todu-client.js";
import { createTuiQueryClient } from "../state/query-client.js";
import { HomeScreen } from "./HomeScreen.js";

function renderWithQuery(children: ReactNode): ReturnType<typeof render> {
  const queryClient = createTuiQueryClient();
  function Wrapper(): JSX.Element {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return render(<Wrapper />);
}

function createHabit(id: string, title: string) {
  return {
    id,
    title,
    projectId: "project-1",
    schedule: "FREQ=DAILY",
    timezone: "America/Chicago",
    startDate: "2026-07-01",
    nextDue: "2026-07-20",
    paused: false,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  };
}

function createTask(overrides: Record<string, unknown>): Task {
  return {
    id: "task-1",
    title: "Task",
    status: "active",
    priority: "medium",
    projectId: "project-1",
    labels: [],
    assigneeActorIds: [],
    assignees: [],
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  } as Task;
}

function createClient(): TuiToduClient {
  const habits = [createHabit("hab-1", "Meditate"), createHabit("hab-2", "Stretch")];
  const checkedIds = new Set(["hab-2"]);
  const tasks = [
    createTask({ id: "task-progress", title: "Work now", status: "inprogress" }),
    createTask({ id: "task-today", title: "Due today", dueDate: "2026-07-20" }),
    createTask({ id: "task-next", title: "Plan next", priority: "high" }),
    createTask({ id: "task-two-days", title: "Due in two days", dueDate: "2026-07-22" }),
    createTask({ id: "task-waiting", title: "Waiting on review", status: "waiting" }),
  ];

  return {
    actor: { list: vi.fn().mockResolvedValue([]) },
    project: { list: vi.fn().mockResolvedValue([]), get: vi.fn() },
    task: {
      list: vi.fn().mockResolvedValue(tasks),
      get: vi.fn(),
      update: vi.fn(),
      createComment: vi.fn(),
    },
    note: { list: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn() },
    habit: {
      list: vi
        .fn()
        .mockImplementation((filter = {}) =>
          Promise.resolve(
            filter.checkedToday ? habits.filter((habit) => checkedIds.has(habit.id)) : habits,
          ),
        ),
      check: vi.fn().mockImplementation((id: string) => {
        checkedIds.add(id);
        return Promise.resolve({ date: "2026-07-20", completed: true });
      }),
      uncheck: vi.fn().mockImplementation((id: string) => {
        checkedIds.delete(id);
        return Promise.resolve({ date: "2026-07-20", completed: false });
      }),
    },
    sync: {
      status: vi
        .fn()
        .mockResolvedValue({ local: { mode: "standalone" }, remote: { state: "disconnected" } }),
    },
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

describe("HomeScreen", () => {
  it("renders Now, Next, and Waiting without habits", async () => {
    const { lastFrame } = renderWithQuery(
      <HomeScreen client={createClient()} today="2026-07-20" />,
    );

    await waitForFrameText(lastFrame, "Work now");
    expect(lastFrame()).toContain("> Now (2)");
    expect(lastFrame()).toContain("Due today");
    expect(lastFrame()).toContain("Next (2)");
    expect(lastFrame()).toContain("Plan next");
    expect(lastFrame()).toContain("Due in two days");
    expect(lastFrame()).toContain("Waiting (1)");
    expect(lastFrame()).toContain("Waiting on review");
    expect(lastFrame()).not.toContain("Habits");
  });

  it("switches section focus with Shift+J and Shift+K", async () => {
    const { stdin, lastFrame } = renderWithQuery(
      <HomeScreen client={createClient()} today="2026-07-20" />,
    );

    await waitForFrameText(lastFrame, "> Now");
    stdin.write("J");
    await waitForFrameText(lastFrame, "> Next");
    stdin.write("J");
    await waitForFrameText(lastFrame, "> Waiting");
    stdin.write("J");
    expect(lastFrame()).toContain("> Waiting");
    stdin.write("K");
    await waitForFrameText(lastFrame, "> Next");
  });

  it("moves between items in the focused task section with j/k or arrow keys", async () => {
    const { stdin, lastFrame } = renderWithQuery(
      <HomeScreen client={createClient()} today="2026-07-20" />,
    );

    await waitForFrameText(lastFrame, "> • Work now");
    stdin.write("j");
    await waitForFrameText(lastFrame, "> • Due today");
    stdin.write("\u001B[A");
    await waitForFrameText(lastFrame, "> • Work now");
    stdin.write("\u001B[B");
    await waitForFrameText(lastFrame, "> • Due today");

    stdin.write("J");
    await waitForFrameText(lastFrame, "> • Plan next");
    stdin.write("k");
    expect(lastFrame()).toContain("> • Plan next");
  });

  it("scrolls the whole Home view to keep the focused item visible", async () => {
    const client = createClient();
    const tasks = Array.from({ length: 14 }, (_, index) =>
      createTask({
        id: `task-now-${index + 1}`,
        title: `Now task ${index + 1}`,
        status: "inprogress",
      }),
    );
    vi.mocked(client.task.list).mockResolvedValue(tasks);
    const { stdin, lastFrame } = renderWithQuery(<HomeScreen client={client} today="2026-07-20" />);

    await waitForFrameText(lastFrame, "Now task 1");
    expect(lastFrame()).not.toContain("Waiting (0)");
    for (let index = 0; index < 11; index += 1) {
      stdin.write("j");
    }
    await waitForFrameText(lastFrame, "> • Now task 12");
    expect(lastFrame()).not.toMatch(/• Now task 1\s+│/);

    stdin.write("J");
    await waitForFrameText(lastFrame, "> Next (0)");
    stdin.write("J");
    await waitForFrameText(lastFrame, "> Waiting (0)");
  });
});
