import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "ink-testing-library";
import type { JSX, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { type TuiToduClient, TuiToduClientError } from "../daemon/todu-client.js";
import { createTuiQueryClient } from "../state/query-client.js";
import { DataStatusScreen } from "./DataStatusScreen.js";

function renderWithQuery(children: ReactNode): ReturnType<typeof render> {
  const queryClient = createTuiQueryClient();
  function Wrapper(): JSX.Element {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return render(<Wrapper />);
}

function createClient(overrides: Partial<TuiToduClient> = {}): TuiToduClient {
  return {
    actor: { list: vi.fn().mockResolvedValue([]) },
    project: {
      list: vi.fn().mockResolvedValue([{ id: "project-1", name: "Inbox" }]),
      get: vi.fn(),
    },
    task: {
      list: vi.fn().mockResolvedValue([
        { id: "task-1", title: "One" },
        { id: "task-2", title: "Two" },
      ]),
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
    ...overrides,
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

describe("DataStatusScreen", () => {
  it("renders project and task counts from daemon data", async () => {
    const { lastFrame } = renderWithQuery(<DataStatusScreen client={createClient()} />);

    await waitForFrameText(lastFrame, "Data status ready");

    expect(lastFrame()).toContain("Projects: 1");
    expect(lastFrame()).toContain("Tasks: 2");
  });

  it("renders user-facing client errors", async () => {
    const client = createClient({
      project: {
        list: vi.fn().mockRejectedValue(
          new TuiToduClientError({
            method: "project.list",
            code: "DAEMON_UNAVAILABLE",
            message: "project.list failed (DAEMON_UNAVAILABLE): socket missing",
            userMessage: "Daemon unavailable. Start it with: todu daemon start.",
          }),
        ),
        get: vi.fn(),
      },
    });
    const { lastFrame } = renderWithQuery(<DataStatusScreen client={client} />);

    await waitForFrameText(lastFrame, "Data status unavailable");

    expect(lastFrame()).toContain("Daemon unavailable. Start it with: todu daemon start.");
  });
});
