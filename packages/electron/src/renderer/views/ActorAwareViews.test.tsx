/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import type { Note, Project, Task, TaskWithDetail } from "@todu/core/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as hooks from "../hooks/useTodu.js";
import { NoteList } from "./NoteList.js";
import { ProjectDetail } from "./ProjectDetail.js";
import { TaskDetail } from "./TaskDetail.js";

vi.mock("../hooks/useTodu.js", () => ({
  useActors: vi.fn(),
  useDeleteNote: vi.fn(),
  useDeleteProject: vi.fn(),
  useDeleteTask: vi.fn(),
  useMoveTask: vi.fn(),
  useNotes: vi.fn(),
  useProject: vi.fn(),
  useProjects: vi.fn(),
  useSearchTasks: vi.fn(),
  useTask: vi.fn(),
  useTasks: vi.fn(),
  useUpdateProject: vi.fn(),
  useUpdateTask: vi.fn(),
}));

vi.mock("../components/CommentThread.js", () => ({
  CommentThread: () => <div>Comments</div>,
}));

vi.mock("../components/ConfirmDialog.js", () => ({
  ConfirmDialog: () => null,
}));

vi.mock("../components/MarkdownEditor.js", () => ({
  MarkdownEditor: ({ value }: { value?: string }) => <div>{value}</div>,
}));

vi.mock("../components/PriorityChip.js", () => ({
  PriorityChip: ({ priority }: { priority: string }) => <span>{priority}</span>,
}));

vi.mock("../components/StatusChip.js", () => ({
  StatusChip: ({ status }: { status: string }) => <span>{status}</span>,
}));

vi.mock("../components/TabBar.js", () => ({
  TabBar: ({ tabs }: { tabs: Array<{ id: string; label: string }> }) => (
    <div>
      {tabs.map((tab) => (
        <span key={tab.id}>{tab.label}</span>
      ))}
    </div>
  ),
}));

vi.mock("../components/FilterBar.js", () => ({
  FilterBar: () => <div>FilterBar</div>,
}));

vi.mock("../components/TaskTable.js", () => ({
  TaskTable: () => <div>TaskTable</div>,
}));

function makeTask(overrides: Partial<TaskWithDetail> = {}): TaskWithDetail {
  return {
    id: "task-1" as TaskWithDetail["id"],
    title: "Actor task",
    status: "active",
    priority: "medium",
    projectId: "proj-1" as TaskWithDetail["projectId"],
    labels: [],
    assigneeActorIds: ["actor-user", "actor-reviewer"] as Task["assigneeActorIds"],
    assignees: [],
    description: "Imported instructions",
    descriptionApproval: {
      state: "pendingApproval",
      sourceBindingId: "bind-1" as NonNullable<
        TaskWithDetail["descriptionApproval"]
      >["sourceBindingId"],
    },
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "proj-1" as Project["id"],
    name: "Inbox",
    status: "active",
    priority: "medium",
    authorizedAssigneeActorIds: [
      "actor-user",
      "actor-reviewer",
    ] as Project["authorizedAssigneeActorIds"],
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "note-1" as Note["id"],
    content: "Imported note",
    author: "legacy-reviewer",
    authorActorId: "actor-reviewer" as NonNullable<Note["authorActorId"]>,
    contentApproval: { state: "pendingApproval" },
    tags: [],
    createdAt: "2026-03-14T15:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  Object.defineProperty(window, "todu", {
    configurable: true,
    value: {
      agent: {
        focusEntity: vi.fn().mockResolvedValue(undefined),
        clearFocusedEntity: vi.fn().mockResolvedValue(undefined),
      },
    },
  });

  vi.mocked(hooks.useActors).mockReturnValue({
    data: [
      { id: "actor-user", displayName: "user" },
      { id: "actor-reviewer", displayName: "Reviewer" },
    ],
  } as ReturnType<typeof hooks.useActors>);

  vi.mocked(hooks.useProjects).mockReturnValue({
    data: [makeProject()],
  } as ReturnType<typeof hooks.useProjects>);

  vi.mocked(hooks.useTask).mockReturnValue({
    data: makeTask(),
    isLoading: false,
    isError: false,
    error: null,
  } as ReturnType<typeof hooks.useTask>);

  vi.mocked(hooks.useUpdateTask).mockReturnValue({
    mutate: vi.fn(),
  } as ReturnType<typeof hooks.useUpdateTask>);

  vi.mocked(hooks.useDeleteTask).mockReturnValue({
    mutate: vi.fn(),
  } as ReturnType<typeof hooks.useDeleteTask>);

  vi.mocked(hooks.useMoveTask).mockReturnValue({
    mutate: vi.fn(),
  } as ReturnType<typeof hooks.useMoveTask>);

  vi.mocked(hooks.useProject).mockReturnValue({
    data: makeProject(),
    isLoading: false,
    isError: false,
    error: null,
  } as ReturnType<typeof hooks.useProject>);

  vi.mocked(hooks.useUpdateProject).mockReturnValue({
    mutate: vi.fn(),
  } as ReturnType<typeof hooks.useUpdateProject>);

  vi.mocked(hooks.useDeleteProject).mockReturnValue({
    mutate: vi.fn(),
  } as ReturnType<typeof hooks.useDeleteProject>);

  vi.mocked(hooks.useTasks).mockReturnValue({
    data: [],
  } as ReturnType<typeof hooks.useTasks>);

  vi.mocked(hooks.useSearchTasks).mockReturnValue({
    data: [],
  } as ReturnType<typeof hooks.useSearchTasks>);

  vi.mocked(hooks.useNotes).mockReturnValue({
    data: [makeNote()],
    isLoading: false,
    isError: false,
    error: null,
  } as ReturnType<typeof hooks.useNotes>);

  vi.mocked(hooks.useDeleteNote).mockReturnValue({
    mutate: vi.fn(),
  } as ReturnType<typeof hooks.useDeleteNote>);
});

afterEach(() => {
  cleanup();
});

describe("actor-aware renderer views", () => {
  it("shows actor assignees and approval state in task detail", async () => {
    render(<TaskDetail taskId="task-1" onBack={() => {}} />);

    expect(screen.getByText("Assignees")).toBeDefined();
    expect(screen.getByText("user")).toBeDefined();
    expect(screen.getByText("Reviewer")).toBeDefined();
    expect(screen.getByText("Approval needed")).toBeDefined();
  });

  it("shows authorized assignee actors in project detail", async () => {
    render(
      <ProjectDetail
        projectId="proj-1"
        onBack={() => {}}
        onSelectTask={() => {}}
        onCreateTask={() => {}}
      />,
    );

    expect(screen.getByText("Authorized assignees")).toBeDefined();
    expect(screen.getByText("user")).toBeDefined();
    expect(screen.getByText("Reviewer")).toBeDefined();
  });

  it("shows actor-based note authors and approval state in note list", async () => {
    render(<NoteList onCreateNote={() => {}} onNavigateToEntity={() => {}} />);

    expect(screen.getByText("Reviewer")).toBeDefined();
    expect(screen.getByText("Approval needed")).toBeDefined();
    expect(screen.getByText("Imported note")).toBeDefined();
  });
});
