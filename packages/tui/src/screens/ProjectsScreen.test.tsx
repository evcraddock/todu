import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "ink-testing-library";
import type { JSX, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { type TuiToduClient, TuiToduClientError } from "../daemon/todu-client.js";
import { allProjectsFilter } from "../state/project-filter.js";
import { createTuiQueryClient } from "../state/query-client.js";
import {
  createProjectOptions,
  moveProjectOption,
  ProjectsScreen,
  resolveProjectOptionId,
} from "./ProjectsScreen.js";

function renderWithQuery(children: ReactNode): ReturnType<typeof render> {
  const queryClient = createTuiQueryClient();
  function Wrapper(): JSX.Element {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return render(<Wrapper />);
}

function createProject(overrides: Record<string, unknown> = {}) {
  return {
    id: "project-1",
    name: "Inbox",
    description: "Default project",
    status: "active",
    priority: "medium",
    authorizedAssigneeActorIds: [],
    createdAt: "2026-06-30T00:00:00.000Z",
    updatedAt: "2026-06-30T00:00:00.000Z",
    ...overrides,
  };
}

function createClient(overrides: Partial<TuiToduClient> = {}): TuiToduClient {
  return {
    actor: { list: vi.fn().mockResolvedValue([]) },
    project: {
      list: vi
        .fn()
        .mockResolvedValue([
          createProject(),
          createProject({ id: "project-2", name: "Work", description: "Work project" }),
        ]),
      get: vi.fn(),
    },
    task: {
      list: vi.fn().mockResolvedValue([]),
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
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (lastFrame()?.includes(text)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(`Timed out waiting for frame text: ${text}\nLast frame:\n${lastFrame() ?? ""}`);
}

describe("ProjectsScreen", () => {
  it("renders projects and selected project details", async () => {
    const { lastFrame } = renderWithQuery(
      <ProjectsScreen
        client={createClient()}
        projectFilter={allProjectsFilter}
        onSelectProject={vi.fn()}
        onSelectAllProjects={vi.fn()}
      />,
    );

    await waitForFrameText(lastFrame, "Projects (2)");

    expect(lastFrame()).toContain("┌");
    expect(lastFrame()).toContain("└");
    expect(lastFrame()).toContain("> All projects");
    expect(lastFrame()).toContain("Inbox");
    expect(lastFrame()).toContain("Work");
    expect(lastFrame()).toContain("Project detail");
    expect(lastFrame()).toContain("Press Enter or a to show tasks from every");
    expect(lastFrame()).toContain("project.");
  });

  it("moves selection and selects a project with enter", async () => {
    const onSelectProject = vi.fn();
    const { stdin, lastFrame } = renderWithQuery(
      <ProjectsScreen
        client={createClient()}
        projectFilter={allProjectsFilter}
        onSelectProject={onSelectProject}
        onSelectAllProjects={vi.fn()}
      />,
    );

    await waitForFrameText(lastFrame, "Projects (2)");

    stdin.write("j");
    await waitForFrameText(lastFrame, "Default project");
    stdin.write("\r");

    expect(onSelectProject).toHaveBeenCalledWith(expect.objectContaining({ id: "project-1" }));
  });

  it("clears to all projects with a", async () => {
    const onSelectAllProjects = vi.fn();
    const { stdin, lastFrame } = renderWithQuery(
      <ProjectsScreen
        client={createClient()}
        projectFilter={{ projectId: "project-1", projectName: "Inbox" }}
        onSelectProject={vi.fn()}
        onSelectAllProjects={onSelectAllProjects}
      />,
    );

    await waitForFrameText(lastFrame, "Projects (2)");
    stdin.write("a");

    expect(onSelectAllProjects).toHaveBeenCalledTimes(1);
  });

  it("renders loading state inside the pane layout", async () => {
    const client = createClient({
      project: { list: vi.fn().mockImplementation(() => new Promise(() => {})), get: vi.fn() },
    });
    const { lastFrame } = renderWithQuery(
      <ProjectsScreen
        client={client}
        projectFilter={allProjectsFilter}
        onSelectProject={vi.fn()}
        onSelectAllProjects={vi.fn()}
      />,
    );

    await waitForFrameText(lastFrame, "Projects • loading…");
    expect(lastFrame()).toContain("┌");
    expect(lastFrame()).toContain("Loading projects…");
    expect(lastFrame()).toContain("Project details will appear after projects load.");
  });

  it("renders empty state", async () => {
    const client = createClient({
      project: { list: vi.fn().mockResolvedValue([]), get: vi.fn() },
    });
    const { lastFrame } = renderWithQuery(
      <ProjectsScreen
        client={client}
        projectFilter={allProjectsFilter}
        onSelectProject={vi.fn()}
        onSelectAllProjects={vi.fn()}
      />,
    );

    await waitForFrameText(lastFrame, "No projects available.");
    expect(lastFrame()).toContain("┌");
    expect(lastFrame()).toContain("Project detail");
  });

  it("renders user-facing errors", async () => {
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
    const { lastFrame } = renderWithQuery(
      <ProjectsScreen
        client={client}
        projectFilter={allProjectsFilter}
        onSelectProject={vi.fn()}
        onSelectAllProjects={vi.fn()}
      />,
    );

    await waitForFrameText(lastFrame, "Projects unavailable");
    expect(lastFrame()).toContain("┌");
    expect(lastFrame()).toContain("Project detail");
    expect(lastFrame()).toContain("Daemon unavailable. Start it with: todu daemon start.");
  });
});

describe("project option helpers", () => {
  it("adds all projects before fetched projects", () => {
    expect(createProjectOptions([createProject()])).toEqual([
      { id: "__all__", label: "All projects", project: null },
      { id: "project-1", label: "Inbox", project: createProject() },
    ]);
  });

  it("preserves or falls back selected option IDs", () => {
    const options = createProjectOptions([createProject()]);

    expect(resolveProjectOptionId(options, "project-1")).toBe("project-1");
    expect(resolveProjectOptionId(options, "missing")).toBe("__all__");
  });

  it("moves project option selection within bounds", () => {
    const options = createProjectOptions([createProject()]);

    expect(moveProjectOption(options, "__all__", "next")).toBe("project-1");
    expect(moveProjectOption(options, "project-1", "previous")).toBe("__all__");
    expect(moveProjectOption(options, "project-1", "next")).toBe("project-1");
  });
});
