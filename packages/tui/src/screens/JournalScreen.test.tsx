import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "ink-testing-library";
import type { JSX, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { TuiToduClient } from "../daemon/todu-client.js";
import { createTuiQueryClient } from "../state/query-client.js";
import { JournalScreen } from "./JournalScreen.js";

function renderWithQuery(children: ReactNode): ReturnType<typeof render> {
  const queryClient = createTuiQueryClient();
  function Wrapper(): JSX.Element {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return render(<Wrapper />);
}

function createClient(): TuiToduClient {
  const entries = [
    {
      id: "note-1",
      content: "Started the journal\nThis full body stays hidden in the list.",
      author: "Erik",
      tags: [],
      createdAt: "2026-07-22T15:30:00.000Z",
    },
    {
      id: "note-2",
      content: "Second reflection",
      author: "Erik",
      tags: [],
      createdAt: "2026-07-23T15:30:00.000Z",
    },
  ];

  return {
    actor: { list: vi.fn().mockResolvedValue([]) },
    project: { list: vi.fn().mockResolvedValue([]), get: vi.fn() },
    task: {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn(),
      update: vi.fn(),
      createComment: vi.fn(),
    },
    note: {
      list: vi.fn().mockResolvedValue(entries),
      create: vi.fn().mockResolvedValue({
        id: "note-3",
        content: "New reflection",
        author: "Erik",
        tags: [],
        createdAt: "2026-07-24T16:00:00.000Z",
      }),
      update: vi.fn().mockImplementation((id: string, input: { content?: string }) =>
        Promise.resolve({
          ...entries.find((entry) => entry.id === id),
          content: input.content ?? "",
        }),
      ),
    },
    habit: { list: vi.fn().mockResolvedValue([]), check: vi.fn(), uncheck: vi.fn() },
    sync: {
      status: vi
        .fn()
        .mockResolvedValue({ local: { mode: "standalone" }, remote: { state: "disconnected" } }),
    },
  };
}

async function waitForFrameText(lastFrame: () => string | undefined, text: string): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (lastFrame()?.includes(text)) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for frame text: ${text}\nLast frame:\n${lastFrame() ?? ""}`);
}

describe("JournalScreen", () => {
  it("lists date-and-time-only rows for the selected Sunday-through-Saturday week", async () => {
    const client = createClient();
    const { lastFrame } = renderWithQuery(
      <JournalScreen
        client={client}
        initialDate={new Date(2026, 6, 22, 12)}
        timezone="America/Chicago"
      />,
    );

    await waitForFrameText(lastFrame, "> Wed, Jul 22");
    expect(lastFrame()).toContain("Jul 19 – Jul 25, 2026");
    expect(lastFrame()).not.toContain("Started the journal");
    expect(lastFrame()).not.toContain("This full body stays hidden in the list.");
    expect(lastFrame()).not.toContain("Second reflection");
    expect(client.note.list).toHaveBeenCalledWith({
      journal: true,
      createdFrom: "2026-07-19",
      createdTo: "2026-07-25",
      timezone: "America/Chicago",
    });
  });

  it("moves to adjacent weeks with Shift+L and Shift+H", async () => {
    const client = createClient();
    const { stdin, lastFrame } = renderWithQuery(
      <JournalScreen client={client} initialDate={new Date(2026, 6, 22, 12)} />,
    );

    await waitForFrameText(lastFrame, "Jul 19 – Jul 25, 2026");
    stdin.write("L");
    await waitForFrameText(lastFrame, "Jul 26 – Aug 1, 2026");
    stdin.write("H");
    await waitForFrameText(lastFrame, "Jul 19 – Jul 25, 2026");
  });

  it("creates an entry composed in the terminal editor", async () => {
    const client = createClient();
    const composeEntry = vi.fn().mockReturnValue("New reflection");
    const { stdin, lastFrame } = renderWithQuery(
      <JournalScreen
        client={client}
        initialDate={new Date(2026, 6, 22, 12)}
        composeEntry={composeEntry}
      />,
    );

    await waitForFrameText(lastFrame, "> Wed, Jul 22");
    stdin.write("n");
    await waitForFrameText(lastFrame, "Journal entry added.");
    expect(composeEntry).toHaveBeenCalledWith("");
    expect(client.note.create).toHaveBeenCalledWith({ content: "New reflection" });
  });

  it("selects an entry and updates it through the terminal editor", async () => {
    const client = createClient();
    const composeEntry = vi.fn().mockReturnValue("Updated second reflection");
    const { stdin, lastFrame } = renderWithQuery(
      <JournalScreen
        client={client}
        initialDate={new Date(2026, 6, 22, 12)}
        composeEntry={composeEntry}
      />,
    );

    await waitForFrameText(lastFrame, "> Wed, Jul 22");
    stdin.write("j");
    await waitForFrameText(lastFrame, "> Thu, Jul 23");
    stdin.write("\r");
    await waitForFrameText(lastFrame, "Journal entry updated.");
    expect(composeEntry).toHaveBeenCalledWith("Second reflection");
    expect(client.note.update).toHaveBeenCalledWith("note-2", {
      content: "Updated second reflection",
    });
  });
});
