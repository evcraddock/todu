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
      list: vi.fn().mockResolvedValue([
        {
          id: "note-1",
          content: "Started the journal",
          author: "Erik",
          tags: [],
          createdAt: "2026-07-22T15:30:00.000Z",
        },
      ]),
      create: vi.fn().mockResolvedValue({
        id: "note-2",
        content: "New reflection",
        author: "Erik",
        tags: [],
        createdAt: "2026-07-22T16:00:00.000Z",
      }),
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
  it("lists standalone entries for the selected Sunday-through-Saturday week", async () => {
    const client = createClient();
    const { lastFrame } = renderWithQuery(
      <JournalScreen
        client={client}
        initialDate={new Date(2026, 6, 22, 12)}
        timezone="America/Chicago"
      />,
    );

    await waitForFrameText(lastFrame, "Started the journal");
    expect(lastFrame()).toContain("Jul 19 – Jul 25, 2026");
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

    await waitForFrameText(lastFrame, "Started the journal");
    stdin.write("n");
    await waitForFrameText(lastFrame, "Journal entry added.");
    expect(composeEntry).toHaveBeenCalledOnce();
    expect(client.note.create).toHaveBeenCalledWith({ content: "New reflection" });
  });
});
