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
    note: { list: vi.fn().mockResolvedValue([]), create: vi.fn() },
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
  it("renders Now, Next, Waiting, and Habits with the expected content", async () => {
    const { stdin, lastFrame } = renderWithQuery(
      <HomeScreen client={createClient()} today="2026-07-20" />,
    );

    await waitForFrameText(lastFrame, "Work now");
    expect(lastFrame()).toContain("> Now (2)");
    expect(lastFrame()).toContain("Due today");
    expect(lastFrame()).toContain("Next (2)");
    expect(lastFrame()).toContain("Waiting (1)");
    expect(lastFrame()).toContain("Habits (2)");

    stdin.write("\n");
    await waitForFrameText(lastFrame, "Plan next");
    expect(lastFrame()).toContain("Due in two days");

    stdin.write("\n");
    await waitForFrameText(lastFrame, "Waiting on review");

    stdin.write("\n");
    await waitForFrameText(lastFrame, "[ ] Meditate");
    expect(lastFrame()).toContain("[x] Stretch");
  });

  it("switches section focus with Ctrl+J and Ctrl+K", async () => {
    const { stdin, lastFrame } = renderWithQuery(
      <HomeScreen client={createClient()} today="2026-07-20" />,
    );

    await waitForFrameText(lastFrame, "> Now");
    stdin.write("\n");
    await waitForFrameText(lastFrame, "> Next");
    stdin.write("\n");
    await waitForFrameText(lastFrame, "> Waiting");
    stdin.write("\n");
    await waitForFrameText(lastFrame, "> Habits");
    stdin.write("\n");
    expect(lastFrame()).toContain("> Habits");
    stdin.write("\u000b");
    await waitForFrameText(lastFrame, "> Waiting");
  });

  it("does not toggle a habit when Ctrl+J is pressed in the Habits section", async () => {
    const client = createClient();
    const { stdin, lastFrame } = renderWithQuery(<HomeScreen client={client} today="2026-07-20" />);

    await waitForFrameText(lastFrame, "Habits (2)");
    stdin.write("\n");
    await waitForFrameText(lastFrame, "> Next");
    stdin.write("\n");
    await waitForFrameText(lastFrame, "> Waiting");
    stdin.write("\n");
    await waitForFrameText(lastFrame, "> Habits");
    stdin.write("\n");
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(client.habit.check).not.toHaveBeenCalled();
    expect(client.habit.uncheck).not.toHaveBeenCalled();
  });

  it("preserves habit navigation and Enter or Space toggling", async () => {
    const client = createClient();
    const { stdin, lastFrame } = renderWithQuery(<HomeScreen client={client} today="2026-07-20" />);

    await waitForFrameText(lastFrame, "Habits (2)");
    stdin.write("\n");
    await waitForFrameText(lastFrame, "> Next");
    stdin.write("\n");
    await waitForFrameText(lastFrame, "> Waiting");
    stdin.write("\n");
    await waitForFrameText(lastFrame, "> Habits");
    stdin.write("\r");
    await waitForFrameText(lastFrame, "[x] Meditate");
    expect(client.habit.check).toHaveBeenCalledWith("hab-1");

    stdin.write("j");
    await waitForFrameText(lastFrame, "> [x] Stretch");
    stdin.write(" ");
    await waitForFrameText(lastFrame, "> [ ] Stretch");
    expect(client.habit.uncheck).toHaveBeenCalledWith("hab-2");
  });
});
