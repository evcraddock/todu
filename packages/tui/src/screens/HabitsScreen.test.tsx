import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "ink-testing-library";
import type { JSX, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { TuiToduClient } from "../daemon/todu-client.js";
import { createTuiQueryClient } from "../state/query-client.js";
import { HabitsScreen } from "./HabitsScreen.js";

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

function createClient(): TuiToduClient {
  const habits = [createHabit("hab-1", "Meditate"), createHabit("hab-2", "Stretch")];
  const checkedIds = new Set(["hab-2"]);

  return {
    actor: { list: vi.fn().mockResolvedValue([]) },
    project: { list: vi.fn().mockResolvedValue([]), get: vi.fn() },
    task: {
      list: vi.fn().mockResolvedValue([]),
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

describe("HabitsScreen", () => {
  it("renders available habits with accurate completion checkboxes", async () => {
    const { lastFrame } = renderWithQuery(<HabitsScreen client={createClient()} />);

    await waitForFrameText(lastFrame, "Habits (2)");

    expect(lastFrame()).toContain("> [ ] Meditate");
    expect(lastFrame()).toContain("[x] Stretch");
  });

  it("moves selection predictably with j, k, and arrow keys", async () => {
    const { stdin, lastFrame } = renderWithQuery(<HabitsScreen client={createClient()} />);

    await waitForFrameText(lastFrame, "> [ ] Meditate");
    stdin.write("j");
    await waitForFrameText(lastFrame, "> [x] Stretch");
    stdin.write("j");
    expect(lastFrame()).toContain("> [x] Stretch");
    stdin.write("k");
    await waitForFrameText(lastFrame, "> [ ] Meditate");
    stdin.write("\u001B[B");
    await waitForFrameText(lastFrame, "> [x] Stretch");
    stdin.write("\u001B[A");
    await waitForFrameText(lastFrame, "> [ ] Meditate");
  });

  it("toggles the selected habit with Enter or Space and updates immediately", async () => {
    const client = createClient();
    const { stdin, lastFrame } = renderWithQuery(<HabitsScreen client={client} />);

    await waitForFrameText(lastFrame, "> [ ] Meditate");
    stdin.write("\r");
    await waitForFrameText(lastFrame, "> [x] Meditate");
    expect(client.habit.check).toHaveBeenCalledWith("hab-1");

    stdin.write(" ");
    await waitForFrameText(lastFrame, "> [ ] Meditate");
    expect(client.habit.uncheck).toHaveBeenCalledWith("hab-1");
  });
});
