import { QueryClientProvider } from "@tanstack/react-query";
import type { Project, Task } from "@todu/core";
import { Box } from "ink";
import { render } from "ink-testing-library";
import type { JSX, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AppFrame } from "../components/AppFrame.js";
import type { TuiToduClient } from "../daemon/todu-client.js";
import { allProjectsFilter } from "../state/project-filter.js";
import { createTuiQueryClient } from "../state/query-client.js";
import { queryKeys } from "../state/query-keys.js";
import { HomeScreen } from "./HomeScreen.js";

function renderWithQuery(
  children: ReactNode,
): ReturnType<typeof render> & { queryClient: ReturnType<typeof createTuiQueryClient> } {
  const queryClient = createTuiQueryClient();
  function Wrapper(): JSX.Element {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return { ...render(<Wrapper />), queryClient };
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

function createProject(overrides: Record<string, unknown> = {}): Project {
  return {
    id: "project-focus",
    name: "Focus project",
    status: "active",
    priority: "high",
    authorizedAssigneeActorIds: [],
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  } as Project;
}

function createClient(): TuiToduClient {
  const habits = [createHabit("hab-1", "Meditate"), createHabit("hab-2", "Stretch")];
  const checkedIds = new Set(["hab-2"]);
  const tasks = [
    createTask({ id: "task-progress", title: "Work now", status: "inprogress" }),
    createTask({ id: "task-today", title: "Due today", dueDate: "2026-07-20" }),
    createTask({
      id: "task-week",
      title: "Plan this week",
      priority: "low",
      scheduledDate: "2026-07-19",
    }),
    createTask({ id: "task-later", title: "Later this week", scheduledDate: "2026-07-25" }),
    createTask({ id: "task-high", title: "Unscheduled important", priority: "high" }),
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
  it("shows loading feedback instead of empty sections until initial tasks arrive", async () => {
    const client = createClient();
    let resolveTasks!: (tasks: Task[]) => void;
    vi.mocked(client.task.list).mockReturnValue(
      new Promise<Task[]>((resolve) => {
        resolveTasks = resolve;
      }),
    );
    const { lastFrame, unmount } = renderWithQuery(<HomeScreen client={client} />);

    await waitForFrameText(lastFrame, "Loading tasks from local daemon…");
    expect(lastFrame()).toContain("Home • loading…");
    expect(lastFrame()).not.toContain("No tasks.");
    expect(lastFrame()).not.toContain("Home • ready");

    resolveTasks([createTask({ title: "Loaded task", status: "inprogress" })]);
    await waitForFrameText(lastFrame, "Home • ready");
    expect(lastFrame()).toContain("Loaded task");
    expect(lastFrame()).not.toContain("Loading tasks");
    unmount();
  });

  it("shows ready and empty sections only after a successful empty response", async () => {
    const client = createClient();
    vi.mocked(client.task.list).mockResolvedValue([]);
    const { lastFrame, unmount } = renderWithQuery(<HomeScreen client={client} />);

    await waitForFrameText(lastFrame, "Home • ready");
    expect(lastFrame()).toContain("No tasks.");
    expect(lastFrame()).not.toContain("loading");
    unmount();
  });

  it("ends loading and reports a failed initial task request without empty sections", async () => {
    const client = createClient();
    let rejectTasks!: (error: Error) => void;
    vi.mocked(client.task.list).mockReturnValue(
      new Promise<Task[]>((_resolve, reject) => {
        rejectTasks = reject;
      }),
    );
    const { lastFrame, unmount } = renderWithQuery(<HomeScreen client={client} />);

    await waitForFrameText(lastFrame, "Loading tasks from local daemon…");
    rejectTasks(new Error("Fixture task request failed"));
    await waitForFrameText(lastFrame, "Home • failed");
    expect(lastFrame()).toContain("Tasks unavailable: Fixture task request failed");
    expect(lastFrame()).not.toContain("loading");
    expect(lastFrame()).not.toContain("No tasks.");
    expect(lastFrame()).not.toContain("Home • ready");
    unmount();
  });

  it("waits for the connection rather than reporting ready when queries are disabled", () => {
    const client = createClient();
    const { lastFrame, unmount } = renderWithQuery(
      <HomeScreen client={client} dataQueriesEnabled={false} />,
    );

    expect(lastFrame()).toContain("Waiting for daemon connection…");
    expect(lastFrame()).not.toContain("No tasks.");
    expect(lastFrame()).not.toContain("Home • ready");
    expect(client.task.list).not.toHaveBeenCalled();
    expect(client.project.list).not.toHaveBeenCalled();
    unmount();
  });

  it("renders Now, This Week, and Waiting with priority guidance but no old Next rules", async () => {
    const { lastFrame } = renderWithQuery(
      <HomeScreen client={createClient()} today="2026-07-20" />,
    );

    await waitForFrameText(lastFrame, "Work now");
    expect(lastFrame()).toContain("> Now (2)");
    expect(lastFrame()).toContain("Due today");
    expect(lastFrame()).toContain("This Week (2)");
    expect(lastFrame()).toMatch(/Plan this week\s+\[low\]/);
    expect(lastFrame()).toMatch(/Later this week\s+\[med\]/);
    expect(lastFrame()).not.toContain("Unscheduled important");
    expect(lastFrame()).not.toContain("Due in two days");
    expect(lastFrame()).not.toContain("Next (");
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
    await waitForFrameText(lastFrame, "> This Week");
    stdin.write("J");
    await waitForFrameText(lastFrame, "> Waiting");
    stdin.write("J");
    await waitForFrameText(lastFrame, "> Project Focus (0)");
    stdin.write("J");
    expect(lastFrame()).toContain("> Project Focus (0)");
    stdin.write("K");
    await waitForFrameText(lastFrame, "> Waiting");
    stdin.write("K");
    await waitForFrameText(lastFrame, "> This Week");
  });

  it("opens the selected task with Enter", async () => {
    const onOpenTask = vi.fn();
    const { stdin, lastFrame } = renderWithQuery(
      <HomeScreen client={createClient()} today="2026-07-20" onOpenTask={onOpenTask} />,
    );

    await waitForFrameText(lastFrame, "> • Work now");
    stdin.write("j");
    await waitForFrameText(lastFrame, "> • Due today");
    stdin.write("\r");

    expect(onOpenTask).toHaveBeenCalledOnce();
    expect(onOpenTask).toHaveBeenCalledWith(
      expect.objectContaining({ id: "task-today", projectId: "project-1" }),
    );
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
    await waitForFrameText(lastFrame, "> • Plan this week");
    stdin.write("k");
    expect(lastFrame()).toContain("> • Plan this week");
  });

  it("opens the selected weekly task, preserves fields, and does not label carryover overdue", async () => {
    const client = createClient();
    const tasks = [
      createTask({
        id: "carryover",
        title: "Carried task",
        priority: "low",
        scheduledDate: "2025-01-05",
      }),
      createTask({
        id: "later",
        title: "Scheduled Saturday",
        priority: "high",
        scheduledDate: "2026-07-25",
        dueDate: "2026-08-01",
      }),
    ];
    const snapshot = structuredClone(tasks);
    tasks.forEach(Object.freeze);
    vi.mocked(client.task.list).mockResolvedValue(tasks);
    const onOpenTask = vi.fn();
    const { stdin, lastFrame, unmount } = renderWithQuery(
      <HomeScreen client={client} today="2026-07-20" onOpenTask={onOpenTask} />,
    );
    try {
      await waitForFrameText(lastFrame, "This Week (2)");
      expect(lastFrame()).toMatch(/Carried task\s+\[low\]/);
      expect(lastFrame()).toMatch(/Scheduled Saturday\s+\[high\]/);
      expect(lastFrame()?.toLowerCase()).not.toContain("overdue");
      stdin.write("J");
      await waitForFrameText(lastFrame, "> • Carried task");
      stdin.write("j");
      await waitForFrameText(lastFrame, "> • Scheduled Saturday");
      stdin.write("\u001B[A");
      await waitForFrameText(lastFrame, "> • Carried task");
      stdin.write("\u001B[B");
      await waitForFrameText(lastFrame, "> • Scheduled Saturday");
      stdin.write("\r");
      expect(onOpenTask).toHaveBeenCalledExactlyOnceWith(tasks[1]);
      expect(client.task.update).not.toHaveBeenCalled();
      expect(tasks).toEqual(snapshot);
    } finally {
      unmount();
    }
  });

  it("keeps priority visible when a weekly task title is truncated", async () => {
    const client = createClient();
    const title = "A very long weekly task title ".repeat(8);
    vi.mocked(client.task.list).mockResolvedValue([
      createTask({ title, priority: "high", scheduledDate: "2026-07-19" }),
    ]);
    const { lastFrame, unmount } = renderWithQuery(
      <HomeScreen client={client} today="2026-07-20" />,
    );
    try {
      await waitForFrameText(lastFrame, "This Week (1)");
      expect(lastFrame()).toContain("A very long weekly task title");
      expect(lastFrame()).not.toContain(title);
      expect(lastFrame()).toContain("[high]");
    } finally {
      unmount();
    }
  });

  it.each([
    40, 100,
  ])("keeps long weekly task rows within the viewport at %s columns", async (width) => {
    const client = createClient();
    vi.mocked(client.task.list).mockResolvedValue(
      Array.from({ length: 14 }, (_, index) =>
        createTask({
          id: `weekly-${index}`,
          title: `Weekly ${index + 1} ${"A very long weekly task title ".repeat(8)}`,
          priority: "high",
          scheduledDate: "2026-07-19",
        }),
      ),
    );
    const { stdin, lastFrame, unmount } = renderWithQuery(
      <Box width={width}>
        <HomeScreen client={client} today="2026-07-20" />
      </Box>,
    );
    try {
      await waitForFrameText(lastFrame, "Home • ready");
      const initialLines = lastFrame()?.split("\n") ?? [];
      expect(initialLines.length).toBeLessThanOrEqual(17);
      expect(initialLines.find((line) => line.includes("• Weekly 1 "))).toContain("[high]");
      stdin.write("J");
      await waitForFrameText(lastFrame, "> • Weekly 1 ");
      for (let index = 0; index < 13; index += 1) stdin.write("j");
      await waitForFrameText(lastFrame, "> • Weekly 14 ");
      const lines = lastFrame()?.split("\n") ?? [];
      expect(lines.length).toBeLessThanOrEqual(17);
      expect(lines.find((line) => line.includes("> • Weekly 14 "))).toContain("[high]");
      for (const line of lines.filter((line) => line.includes("• Weekly"))) {
        expect(line).toContain("[high]");
      }
    } finally {
      unmount();
    }
  });

  it.each([
    40, 100,
  ])("keeps intermediate scrolling separate from app chrome at %s columns", async (width) => {
    const client = createClient();
    vi.mocked(client.task.list).mockResolvedValue(
      Array.from({ length: 14 }, (_, index) =>
        createTask({
          id: `weekly-${index}`,
          title: `Weekly ${index + 1} ${"A very long weekly task title ".repeat(8)}`,
          priority: "high",
          scheduledDate: "2026-07-19",
        }),
      ),
    );
    const { stdin, lastFrame, unmount } = renderWithQuery(
      <AppFrame
        route="home"
        taskFilter={{ projectFilter: allProjectsFilter }}
        footerContext="home"
        terminalWidth={width}
        terminalHeight={24}
      >
        <HomeScreen client={client} today="2026-07-20" />
      </AppFrame>,
    );
    try {
      await waitForFrameText(lastFrame, "Home • ready");
      stdin.write("J");
      await waitForFrameText(lastFrame, "> • Weekly 1 ");
      for (let index = 0; index < 11; index += 1) stdin.write("j");
      await waitForFrameText(lastFrame, "> • Weekly 12 ");
      const frame = lastFrame() ?? "";
      const lines = frame.split("\n");
      expect(lines).toHaveLength(24);
      expect(frame).toMatch(/↑ \d+ more/);
      expect(frame).toMatch(/↓ \d+ more/);
      expect(frame).toContain("Home • ready");
      expect(lines.find((line) => line.includes("> • Weekly 12 "))).toContain("[high]");
      expect(lines.find((line) => line.includes("• Weekly 14 "))).toContain("[high]");
      expect(lines.find((line) => line.includes("Waiting (0)"))).not.toContain("[high]");
    } finally {
      unmount();
    }
  });

  it("refreshes weekly membership after scheduling/status changes, not priority changes", async () => {
    const client = createClient();
    const tasks = [
      createTask({
        id: "selected",
        title: "Selected weekly task",
        priority: "low",
        scheduledDate: "2026-07-19",
      }),
      createTask({ id: "cleared", title: "Schedule cleared", scheduledDate: "2026-07-19" }),
      createTask({ id: "future", title: "Rescheduled future", scheduledDate: "2026-07-19" }),
    ];
    const snapshot = structuredClone(tasks);
    vi.mocked(client.task.list).mockResolvedValue(tasks);
    const onOpenTask = vi.fn();
    const { stdin, lastFrame, unmount, queryClient } = renderWithQuery(
      <HomeScreen client={client} today="2026-07-20" onOpenTask={onOpenTask} />,
    );
    try {
      await waitForFrameText(lastFrame, "This Week (3)");
      stdin.write("J");
      await waitForFrameText(lastFrame, "> • Selected weekly task");
      expect(lastFrame()).toMatch(/Selected weekly task\s+\[low\]/);
      vi.mocked(client.task.list).mockResolvedValue([
        { ...tasks[0], priority: "high" },
        { ...tasks[1], scheduledDate: undefined },
        { ...tasks[2], scheduledDate: "2026-07-26" },
      ]);
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      await waitForFrameText(lastFrame, "This Week (1)");
      expect(lastFrame()).toMatch(/> • Selected weekly task\s+\[high\]/);
      expect(lastFrame()).not.toContain("Schedule cleared");
      expect(lastFrame()).not.toContain("Rescheduled future");

      vi.mocked(client.task.list).mockResolvedValue([
        { ...tasks[0], status: "inprogress" },
        { ...tasks[1], status: "waiting" },
        { ...tasks[2], status: "done" },
      ]);
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      await waitForFrameText(lastFrame, "This Week (0)");
      expect(lastFrame()).toContain("Now (1)");
      expect(lastFrame()).toContain("Waiting (1)");
      expect(lastFrame()).not.toContain("Rescheduled future");
      stdin.write("\r");
      expect(onOpenTask).not.toHaveBeenCalled();
      expect(client.task.update).not.toHaveBeenCalled();
      expect(tasks).toEqual(snapshot);
    } finally {
      unmount();
    }
  });

  it("scrolls a long This Week list and retains its selection between sections", async () => {
    const client = createClient();
    vi.mocked(client.task.list).mockResolvedValue(
      Array.from({ length: 14 }, (_, index) =>
        createTask({
          id: `weekly-${index}`,
          title: `Weekly task ${index + 1}`,
          scheduledDate: "2026-07-19",
        }),
      ),
    );
    const { stdin, lastFrame, unmount } = renderWithQuery(
      <HomeScreen client={client} today="2026-07-20" />,
    );
    try {
      await waitForFrameText(lastFrame, "This Week (14)");
      expect(lastFrame()).not.toContain("Weekly task 14");
      stdin.write("J");
      await waitForFrameText(lastFrame, "> • Weekly task 1");
      for (let index = 0; index < 13; index += 1) stdin.write("j");
      await waitForFrameText(lastFrame, "> • Weekly task 14");
      expect(lastFrame()).not.toContain("Now (0)");
      stdin.write("J");
      await waitForFrameText(lastFrame, "> Waiting (0)");
      stdin.write("K");
      await waitForFrameText(lastFrame, "> • Weekly task 14");
      stdin.write("K");
      await waitForFrameText(lastFrame, "> Now (0)");
    } finally {
      unmount();
    }
  });

  it("shows focus projects independently of task fields, including projects without tasks", async () => {
    const client = createClient();
    const projects = [
      createProject({ id: "project-empty", name: "No tasks project" }),
      createProject({ id: "project-1", name: "Routine tasks project" }),
      createProject({ name: "Medium project", priority: "medium" }),
      createProject({ name: "Low project", priority: "low" }),
      createProject({ name: "Done project", status: "done" }),
      createProject({ name: "Canceled project", status: "canceled" }),
    ];
    const tasks = [
      createTask({ id: "routine", priority: "low", scheduledDate: "2099-01-01" }),
      createTask({ id: "done", status: "done", priority: "medium" }),
    ];
    const snapshot = structuredClone({ projects, tasks });
    vi.mocked(client.project.list).mockResolvedValue(projects);
    vi.mocked(client.task.list).mockResolvedValue(tasks);
    const { lastFrame, unmount } = renderWithQuery(<HomeScreen client={client} />);

    await waitForFrameText(lastFrame, "Home • ready");
    expect(lastFrame()).toContain("Project Focus (2)");
    expect(lastFrame()).toContain("No tasks project");
    expect(lastFrame()).toContain("Routine tasks project");
    for (const excluded of ["Medium project", "Low project", "Done project", "Canceled project"]) {
      expect(lastFrame()).not.toContain(excluded);
    }
    expect({ projects, tasks }).toEqual(snapshot);
    expect(client.task.update).not.toHaveBeenCalled();
    unmount();
  });

  it("keeps tasks usable while projects load and does not report focus as empty", async () => {
    const client = createClient();
    let resolveProjects!: (projects: Project[]) => void;
    vi.mocked(client.project.list).mockReturnValue(
      new Promise((resolve) => {
        resolveProjects = resolve;
      }),
    );
    const onOpenTask = vi.fn();
    const { stdin, lastFrame, unmount } = renderWithQuery(
      <HomeScreen client={client} today="2026-07-20" onOpenTask={onOpenTask} />,
    );

    await waitForFrameText(lastFrame, "Work now");
    expect(lastFrame()).toContain("Home • loading…");
    expect(lastFrame()).toContain("Loading projects from local daemon…");
    expect(lastFrame()).not.toContain("No focused projects.");
    stdin.write("\r");
    expect(onOpenTask).toHaveBeenCalledWith(expect.objectContaining({ id: "task-progress" }));

    resolveProjects([]);
    await waitForFrameText(lastFrame, "Home • ready");
    expect(lastFrame()).toContain("No focused projects.");
    unmount();
  });

  it("reports project failures without hiding tasks or claiming focus is empty", async () => {
    const client = createClient();
    vi.mocked(client.project.list).mockRejectedValue(new Error("Fixture projects failed"));
    const { lastFrame, unmount } = renderWithQuery(
      <HomeScreen client={client} today="2026-07-20" />,
    );

    await waitForFrameText(lastFrame, "Home • failed");
    expect(lastFrame()).toContain("Projects unavailable: Fixture projects failed");
    expect(lastFrame()).toContain("Work now");
    expect(lastFrame()).not.toContain("No focused projects.");
    unmount();
  });

  it.each([
    "loading",
    "failed",
  ])("keeps focus projects usable while tasks are %s", async (state) => {
    const client = createClient();
    const project = createProject();
    vi.mocked(client.project.list).mockResolvedValue([project]);
    if (state === "loading") {
      vi.mocked(client.task.list).mockReturnValue(new Promise(() => {}));
    } else {
      vi.mocked(client.task.list).mockRejectedValue(new Error("Fixture tasks failed"));
    }
    const onSelectProject = vi.fn();
    const { stdin, lastFrame, unmount } = renderWithQuery(
      <HomeScreen client={client} onSelectProject={onSelectProject} />,
    );
    await waitForFrameText(lastFrame, "Project Focus (1)");
    expect(lastFrame()).toContain(`Home • ${state}`);
    stdin.write("J");
    stdin.write("J");
    stdin.write("J");
    await waitForFrameText(lastFrame, "> • Focus project");
    stdin.write("\r");
    expect(onSelectProject).toHaveBeenCalledExactlyOnceWith(project);
    unmount();
  });

  it("selects projects with j/k and arrows, preserves selection, and opens only the project", async () => {
    const client = createClient();
    const projects = [createProject(), createProject({ id: "second", name: "Second focus" })];
    vi.mocked(client.project.list).mockResolvedValue(projects);
    const onSelectProject = vi.fn();
    const onOpenTask = vi.fn();
    const { stdin, lastFrame, unmount } = renderWithQuery(
      <HomeScreen client={client} onSelectProject={onSelectProject} onOpenTask={onOpenTask} />,
    );

    await waitForFrameText(lastFrame, "Home • ready");
    stdin.write("J");
    await waitForFrameText(lastFrame, "> This Week");
    stdin.write("J");
    await waitForFrameText(lastFrame, "> Waiting");
    stdin.write("J");
    await waitForFrameText(lastFrame, "> • Focus project");
    stdin.write("j");
    await waitForFrameText(lastFrame, "> • Second focus");
    stdin.write("\u001B[A");
    await waitForFrameText(lastFrame, "> • Focus project");
    stdin.write("\u001B[B");
    await waitForFrameText(lastFrame, "> • Second focus");
    stdin.write("k");
    await waitForFrameText(lastFrame, "> • Focus project");
    stdin.write("j");
    await waitForFrameText(lastFrame, "> • Second focus");
    stdin.write("K");
    await waitForFrameText(lastFrame, "> Waiting");
    stdin.write("J");
    await waitForFrameText(lastFrame, "> • Second focus");
    stdin.write("\r");
    expect(onSelectProject).toHaveBeenCalledExactlyOnceWith(projects[1]);
    expect(onOpenTask).not.toHaveBeenCalled();
    expect(client.task.update).not.toHaveBeenCalled();
    unmount();
  });

  it("refreshes membership, keeps cached projects visible, and recovers from errors", async () => {
    const client = createClient();
    vi.mocked(client.task.list).mockResolvedValue([]);
    const first = createProject();
    const promoted = createProject({ id: "promoted", name: "Promoted", priority: "medium" });
    const completed = createProject({ id: "completed", name: "Completed" });
    vi.mocked(client.project.list).mockResolvedValue([first, promoted, completed]);
    const onSelectProject = vi.fn();
    const { stdin, lastFrame, unmount, queryClient } = renderWithQuery(
      <HomeScreen client={client} onSelectProject={onSelectProject} />,
    );
    await waitForFrameText(lastFrame, "Home • ready");
    expect(lastFrame()).toContain("Project Focus (2)");
    stdin.write("J");
    await waitForFrameText(lastFrame, "> This Week");
    stdin.write("J");
    await waitForFrameText(lastFrame, "> Waiting");
    stdin.write("J");
    await waitForFrameText(lastFrame, "> • Focus project");

    let resolveProjects!: (projects: Project[]) => void;
    vi.mocked(client.project.list).mockReturnValue(
      new Promise((resolve) => {
        resolveProjects = resolve;
      }),
    );
    const refresh = queryClient.invalidateQueries({ queryKey: queryKeys.projects() });
    await waitForFrameText(lastFrame, "Home • refreshing…");
    expect(lastFrame()).toContain("Focus project");
    expect(lastFrame()).not.toContain("Loading projects");
    resolveProjects([
      { ...first, priority: "medium" },
      { ...promoted, priority: "high" },
      { ...completed, status: "done" },
    ]);
    await refresh;
    await waitForFrameText(lastFrame, "> • Promoted");
    expect(lastFrame()).toContain("Project Focus (1)");
    expect(lastFrame()).not.toContain("Focus project");
    expect(lastFrame()).not.toContain("Completed");
    stdin.write("\r");
    expect(onSelectProject).toHaveBeenCalledWith(expect.objectContaining({ id: "promoted" }));

    vi.mocked(client.project.list).mockRejectedValue(new Error("Refresh failed"));
    await queryClient.invalidateQueries({ queryKey: queryKeys.projects() });
    await waitForFrameText(lastFrame, "Home • failed");
    expect(lastFrame()).toContain("Projects unavailable: Refresh failed");
    expect(lastFrame()).toContain("Promoted");
    vi.mocked(client.project.list).mockResolvedValue([]);
    await queryClient.invalidateQueries({ queryKey: queryKeys.projects() });
    await waitForFrameText(lastFrame, "Home • ready");
    expect(lastFrame()).toContain("No focused projects.");
    onSelectProject.mockClear();
    stdin.write("\r");
    expect(onSelectProject).not.toHaveBeenCalled();
    unmount();
  });

  it("scrolls focus projects into view and back to tasks", async () => {
    const client = createClient();
    vi.mocked(client.project.list).mockResolvedValue(
      Array.from({ length: 14 }, (_, index) =>
        createProject({ id: `project-${index}`, name: `Focus ${index + 1}` }),
      ),
    );
    const { stdin, lastFrame, unmount } = renderWithQuery(
      <HomeScreen client={client} today="2026-07-20" />,
    );
    await waitForFrameText(lastFrame, "Home • ready");
    expect(lastFrame()).not.toContain("Focus 14");
    stdin.write("J");
    await waitForFrameText(lastFrame, "> This Week");
    stdin.write("J");
    await waitForFrameText(lastFrame, "> Waiting");
    stdin.write("J");
    await waitForFrameText(lastFrame, "> • Focus 1");
    for (let index = 0; index < 13; index += 1) stdin.write("j");
    await waitForFrameText(lastFrame, "> • Focus 14");
    expect(lastFrame()).not.toContain("Work now");
    stdin.write("K");
    await waitForFrameText(lastFrame, "> • Waiting on review");
    stdin.write("K");
    await waitForFrameText(lastFrame, "> • Plan this week");
    stdin.write("K");
    await waitForFrameText(lastFrame, "> • Work now");
    unmount();
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
    await waitForFrameText(lastFrame, "> This Week (0)");
    stdin.write("J");
    await waitForFrameText(lastFrame, "> Waiting (0)");
  });
});
