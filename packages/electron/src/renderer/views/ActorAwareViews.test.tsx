/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Actor, ApprovalItem, Note, Project, Task, TaskWithDetail } from "@todu/core/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as hooks from "../hooks/useTodu.js";
import { NoteList } from "./NoteList.js";
import { ProjectDetail } from "./ProjectDetail.js";
import { TaskDetail } from "./TaskDetail.js";

vi.mock("../hooks/useTodu.js", () => ({
  useActors: vi.fn(),
  useApprovals: vi.fn(),
  useApproveNoteContent: vi.fn(),
  useApproveTaskDescription: vi.fn(),
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
    authorizedAssigneeActorIds: ["actor-user"] as Project["authorizedAssigneeActorIds"],
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
    entityType: "task",
    entityId: "task-1",
    tags: [],
    createdAt: "2026-03-14T15:00:00.000Z",
    ...overrides,
  };
}

function makeApproval(overrides: Partial<ApprovalItem> = {}): ApprovalItem {
  return {
    kind: "taskDescription",
    state: "pendingApproval",
    taskId: "task-1" as ApprovalItem["taskId"],
    taskTitle: "Actor task",
    projectId: "proj-1" as ApprovalItem["projectId"],
    contentPreview: "Imported task",
    ...overrides,
  };
}

describe("actor-aware renderer views", () => {
  const deleteNoteMutate = vi.fn();
  const deleteProjectMutate = vi.fn();
  const deleteTaskMutate = vi.fn();
  const moveTaskMutate = vi.fn();
  const updateProjectMutate = vi.fn();
  const updateTaskMutate = vi.fn();
  const approveTaskDescriptionMutate = vi.fn();
  const approveNoteContentMutate = vi.fn();
  const onNavigateToEntity = vi.fn();

  let actorsData: Actor[];
  let approvalsData: ApprovalItem[];
  let notesData: Note[];
  let projectData: Project;
  let projectsData: Project[];
  let taskData: TaskWithDetail;
  let tasksData: Task[];

  beforeEach(() => {
    vi.clearAllMocks();
    deleteNoteMutate.mockReset();
    deleteProjectMutate.mockReset();
    deleteTaskMutate.mockReset();
    moveTaskMutate.mockReset();
    updateProjectMutate.mockReset();
    updateTaskMutate.mockReset();
    approveTaskDescriptionMutate.mockReset();
    approveNoteContentMutate.mockReset();
    onNavigateToEntity.mockReset();

    actorsData = [
      { id: "actor-user", displayName: "user" },
      { id: "actor-reviewer", displayName: "Reviewer", archived: true },
      { id: "actor-collab", displayName: "Collaborator" },
    ];
    approvalsData = [
      makeApproval(),
      makeApproval({
        kind: "noteContent",
        noteId: "note-1" as ApprovalItem["noteId"],
        taskId: undefined,
        taskTitle: undefined,
        entityType: "task",
        entityId: "task-1",
        contentPreview: "Imported note",
      }),
    ];
    projectData = makeProject();
    projectsData = [
      projectData,
      makeProject({
        id: "proj-2" as Project["id"],
        name: "Ops",
        authorizedAssigneeActorIds: ["actor-collab"] as Project["authorizedAssigneeActorIds"],
      }),
    ];
    taskData = makeTask();
    tasksData = [taskData];
    notesData = [makeNote()];

    Object.defineProperty(window, "todu", {
      configurable: true,
      value: {
        agent: {
          focusEntity: vi.fn().mockResolvedValue(undefined),
          clearFocusedEntity: vi.fn().mockResolvedValue(undefined),
        },
      },
    });

    vi.mocked(hooks.useActors).mockImplementation(
      () => ({ data: actorsData }) as ReturnType<typeof hooks.useActors>,
    );

    vi.mocked(hooks.useApprovals).mockImplementation(
      () => ({ data: approvalsData }) as ReturnType<typeof hooks.useApprovals>,
    );

    vi.mocked(hooks.useApproveTaskDescription).mockReturnValue({
      mutate: approveTaskDescriptionMutate,
      isPending: false,
    } as ReturnType<typeof hooks.useApproveTaskDescription>);

    vi.mocked(hooks.useApproveNoteContent).mockReturnValue({
      mutate: approveNoteContentMutate,
      isPending: false,
    } as ReturnType<typeof hooks.useApproveNoteContent>);

    vi.mocked(hooks.useProjects).mockImplementation(
      () => ({ data: projectsData }) as ReturnType<typeof hooks.useProjects>,
    );

    vi.mocked(hooks.useTask).mockImplementation(
      () =>
        ({
          data: taskData,
          isLoading: false,
          isError: false,
          error: null,
        }) as ReturnType<typeof hooks.useTask>,
    );

    vi.mocked(hooks.useUpdateTask).mockReturnValue({
      mutate: updateTaskMutate,
    } as ReturnType<typeof hooks.useUpdateTask>);

    vi.mocked(hooks.useDeleteTask).mockReturnValue({
      mutate: deleteTaskMutate,
    } as ReturnType<typeof hooks.useDeleteTask>);

    vi.mocked(hooks.useMoveTask).mockReturnValue({
      mutate: moveTaskMutate,
    } as ReturnType<typeof hooks.useMoveTask>);

    vi.mocked(hooks.useProject).mockImplementation(
      () =>
        ({
          data: projectData,
          isLoading: false,
          isError: false,
          error: null,
        }) as ReturnType<typeof hooks.useProject>,
    );

    vi.mocked(hooks.useUpdateProject).mockReturnValue({
      mutate: updateProjectMutate,
    } as ReturnType<typeof hooks.useUpdateProject>);

    vi.mocked(hooks.useDeleteProject).mockReturnValue({
      mutate: deleteProjectMutate,
    } as ReturnType<typeof hooks.useDeleteProject>);

    vi.mocked(hooks.useTasks).mockImplementation(
      () => ({ data: tasksData }) as ReturnType<typeof hooks.useTasks>,
    );

    vi.mocked(hooks.useSearchTasks).mockReturnValue({
      data: [],
    } as ReturnType<typeof hooks.useSearchTasks>);

    vi.mocked(hooks.useNotes).mockImplementation(
      () =>
        ({
          data: notesData,
          isLoading: false,
          isError: false,
          error: null,
        }) as ReturnType<typeof hooks.useNotes>,
    );

    vi.mocked(hooks.useDeleteNote).mockReturnValue({
      mutate: deleteNoteMutate,
    } as ReturnType<typeof hooks.useDeleteNote>);
  });

  afterEach(() => {
    cleanup();
  });

  it("shows assignees, approval state, and explicit task approval actions in task detail", async () => {
    render(<TaskDetail taskId="task-1" onBack={() => {}} />);

    expect(screen.getByText("Assignees")).toBeDefined();
    expect(screen.getByText("user (actor-user)")).toBeDefined();
    expect(screen.getByText("Reviewer (actor-reviewer, archived, unauthorized)")).toBeDefined();
    expect(screen.getByText("Approval needed")).toBeDefined();
    expect(screen.getByText("All authorized active actors are already assigned.")).toBeDefined();

    fireEvent.click(screen.getByText("Approve"));

    expect(approveTaskDescriptionMutate).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });

  it("shows task approval errors visibly in task detail", async () => {
    approveTaskDescriptionMutate.mockImplementation((_taskId, options) => {
      options?.onError?.(new Error("description: already approved"));
    });

    render(<TaskDetail taskId="task-1" onBack={() => {}} />);

    fireEvent.click(screen.getByText("Approve"));

    await waitFor(() => {
      expect(screen.getByText("description: already approved")).toBeDefined();
    });
  });

  it("adds actor assignees from the current project's authorized active actors", async () => {
    projectData = makeProject({
      authorizedAssigneeActorIds: [
        "actor-user",
        "actor-reviewer",
        "actor-collab",
      ] as Project["authorizedAssigneeActorIds"],
    });
    projectsData = [projectData, projectsData[1]];
    taskData = makeTask({
      assigneeActorIds: ["actor-user"] as Task["assigneeActorIds"],
    });
    tasksData = [taskData];

    render(<TaskDetail taskId="task-1" onBack={() => {}} />);

    fireEvent.change(screen.getByLabelText("Add assignee actor"), {
      target: { value: "actor-collab" },
    });
    fireEvent.click(screen.getByText("Add"));

    expect(updateTaskMutate).toHaveBeenCalledWith({
      id: "task-1",
      input: {
        assigneeActorIds: ["actor-user", "actor-collab"],
      },
    });
  });

  it("removes and replaces actor assignees without raw id editing", async () => {
    projectData = makeProject({
      authorizedAssigneeActorIds: [
        "actor-user",
        "actor-collab",
      ] as Project["authorizedAssigneeActorIds"],
    });
    projectsData = [projectData, projectsData[1]];

    render(<TaskDetail taskId="task-1" onBack={() => {}} />);

    fireEvent.change(screen.getByLabelText("Replace assignee actor-reviewer"), {
      target: { value: "actor-collab" },
    });
    fireEvent.click(screen.getAllByText("Replace")[1]);

    expect(updateTaskMutate).toHaveBeenCalledWith({
      id: "task-1",
      input: {
        assigneeActorIds: ["actor-user", "actor-collab"],
      },
    });

    fireEvent.click(screen.getAllByText("Remove")[0]);

    expect(updateTaskMutate).toHaveBeenLastCalledWith({
      id: "task-1",
      input: {
        assigneeActorIds: ["actor-reviewer"],
      },
    });
  });

  it("updates project-change behavior and shows a no-authorized-actors state", async () => {
    const { rerender } = render(<TaskDetail taskId="task-1" onBack={() => {}} />);

    fireEvent.change(screen.getByDisplayValue("Inbox"), {
      target: { value: "proj-2" },
    });

    expect(moveTaskMutate).toHaveBeenCalledWith({
      id: "task-1",
      projectId: "proj-2",
    });

    taskData = makeTask({
      projectId: "proj-2" as TaskWithDetail["projectId"],
      assigneeActorIds: ["actor-reviewer"] as Task["assigneeActorIds"],
    });
    tasksData = [taskData];
    projectsData = [
      projectsData[0],
      makeProject({
        id: "proj-2" as Project["id"],
        name: "Ops",
        authorizedAssigneeActorIds: [] as Project["authorizedAssigneeActorIds"],
      }),
    ];

    rerender(<TaskDetail taskId="task-1" onBack={() => {}} />);

    expect(screen.getByText("Reviewer (actor-reviewer, archived, unauthorized)")).toBeDefined();
    expect(
      screen.getByText("No authorized active actors available for this project."),
    ).toBeDefined();
  });

  it("shows project authorization controls and stale unauthorized assignees", async () => {
    render(
      <ProjectDetail
        projectId="proj-1"
        onBack={() => {}}
        onSelectTask={() => {}}
        onCreateTask={() => {}}
      />,
    );

    expect(screen.getByText("Authorized assignees")).toBeDefined();
    expect(screen.getByText("user (actor-user)")).toBeDefined();
    expect(screen.getByText("Unauthorized task assignees")).toBeDefined();
    expect(
      screen.getByText("Actor task: Reviewer (actor-reviewer, archived, unauthorized)"),
    ).toBeDefined();

    fireEvent.change(screen.getByLabelText("Add authorized actor"), {
      target: { value: "actor-collab" },
    });
    fireEvent.click(screen.getByText("Add"));

    expect(updateProjectMutate).toHaveBeenCalledWith({
      id: "proj-1",
      input: {
        authorizedAssigneeActorIds: ["actor-user", "actor-collab"],
      },
    });

    fireEvent.click(screen.getByText("Remove"));

    expect(updateProjectMutate).toHaveBeenLastCalledWith({
      id: "proj-1",
      input: {
        authorizedAssigneeActorIds: [],
      },
    });
  });

  it("shows approval-needed discovery plus explicit note approval actions in note list", async () => {
    render(<NoteList onCreateNote={() => {}} onNavigateToEntity={onNavigateToEntity} />);

    expect(screen.getByText("Approval Needed (2)")).toBeDefined();
    expect(screen.getByText("Task description")).toBeDefined();
    expect(screen.getByText("Note content")).toBeDefined();
    expect(screen.getByText("Reviewer (archived)")).toBeDefined();
    expect(screen.getByText("Approval needed")).toBeDefined();
    expect(screen.getAllByText("Imported note").length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByText("Approve")[0]);
    expect(approveTaskDescriptionMutate).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );

    fireEvent.click(screen.getAllByText("Approve")[1]);
    expect(approveNoteContentMutate).toHaveBeenCalledWith(
      "note-1",
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );

    fireEvent.click(screen.getAllByText("task: Actor task")[0]);
    expect(onNavigateToEntity).toHaveBeenCalledWith("task", "task-1");
  });
});
