import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Project, TaskStatus } from "@todu/core";
import { Box, Text, useInput, useStdout } from "ink";
import type { JSX } from "react";
import { useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { Pane } from "../components/Pane.js";
import { TextInputModal } from "../components/TextInputModal.js";
import { ToastLine, type ToastTone } from "../components/ToastLine.js";
import { TaskDetailPane } from "../components/tasks/TaskDetailPane.js";
import { getVisibleTaskWindow, TaskListPane } from "../components/tasks/TaskListPane.js";
import { formatToduClientError, type TuiToduClient } from "../daemon/todu-client.js";
import { normalizeCommentContent } from "../state/comment-actions.js";
import {
  allProjectsFilter,
  describeProjectFilter,
  type ProjectFilterState,
} from "../state/project-filter.js";
import { queryKeys } from "../state/query-keys.js";
import { getSelectedItem, moveSelection, resolveSelectedId } from "../state/selection.js";
import { resolveTaskStatusAction, taskStatusActions } from "../state/task-actions.js";

export interface TasksScreenProps {
  client: TuiToduClient;
  projectFilter: ProjectFilterState;
  statusActionsEnabled?: boolean;
  dataQueriesEnabled?: boolean;
  onGlobalInputEnabledChange?: (enabled: boolean) => void;
}

const visibleTaskStatuses = ["active", "inprogress", "waiting"] as const;
const ALL_PROJECTS_OPTION_ID = "__all__";
const PROJECT_PANE_WIDTH_PERCENT = 0.36;
const PROJECT_PANE_WIDTH = "36%";
const TASK_MAIN_PANE_WIDTH = "64%";
const MIN_PROJECT_LABEL_LENGTH = 8;
const MIN_VISIBLE_LIST_ITEMS = 6;

type PaneFocus = "projects" | "tasks";

interface ProjectOption {
  id: string;
  label: string;
  project: Project | null;
}

export function TasksScreen({
  client,
  projectFilter,
  statusActionsEnabled = true,
  dataQueriesEnabled = true,
  onGlobalInputEnabledChange,
}: TasksScreenProps): JSX.Element {
  const queryClient = useQueryClient();
  const { stdout } = useStdout();
  const [selectedProjectOptionId, setSelectedProjectOptionId] = useState<string>(
    projectFilter.projectId ?? ALL_PROJECTS_OPTION_ID,
  );
  const [focusedPane, setFocusedPane] = useState<PaneFocus>("tasks");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [commentModalOpen, setCommentModalOpen] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; tone: ToastTone } | null>(null);
  const projectsQuery = useQuery({
    queryKey: queryKeys.projects(),
    queryFn: () => client.project.list(),
    enabled: dataQueriesEnabled,
  });
  const projectOptions = useMemo(
    () => createTaskProjectOptions(projectsQuery.data ?? []),
    [projectsQuery.data],
  );
  const selectedProjectOption =
    projectOptions.find((option) => option.id === selectedProjectOptionId) ?? projectOptions[0];
  const selectedProjectFilter: ProjectFilterState = selectedProjectOption?.project
    ? {
        projectId: selectedProjectOption.project.id,
        projectName: selectedProjectOption.project.name,
      }
    : allProjectsFilter;
  const taskFilter = {
    status: [...visibleTaskStatuses],
    ...(selectedProjectFilter.projectId ? { projectId: selectedProjectFilter.projectId } : {}),
  };
  const tasksQuery = useQuery({
    queryKey: queryKeys.tasks(taskFilter),
    queryFn: () => client.task.list(taskFilter),
    enabled: dataQueriesEnabled,
  });
  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);
  const effectiveSelectedTaskId = resolveSelectedId(tasks, selectedTaskId);
  const selectedTask = getSelectedItem(tasks, effectiveSelectedTaskId);
  const selectedDetailQuery = useQuery({
    queryKey: queryKeys.task(effectiveSelectedTaskId ?? "none"),
    queryFn: () => client.task.get(effectiveSelectedTaskId ?? ""),
    enabled: dataQueriesEnabled && effectiveSelectedTaskId !== null,
  });
  const commentsQuery = useQuery({
    queryKey: queryKeys.taskComments(effectiveSelectedTaskId ?? "none"),
    queryFn: () =>
      client.note.list({ entityType: "task", entityId: effectiveSelectedTaskId ?? "" }),
    enabled: dataQueriesEnabled && effectiveSelectedTaskId !== null,
  });
  const statusMutation = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: TaskStatus }) =>
      client.task.update(taskId, { status }),
  });
  const commentMutation = useMutation({
    mutationFn: ({ taskId, content }: { taskId: string; content: string }) =>
      client.task.createComment(taskId, content),
  });

  useEffect(() => {
    setSelectedProjectOptionId(projectFilter.projectId ?? ALL_PROJECTS_OPTION_ID);
    setTaskDetailOpen(false);
  }, [projectFilter.projectId]);

  useEffect(() => {
    if (!projectsQuery.data) {
      return;
    }

    setSelectedProjectOptionId((current) => resolveTaskProjectOptionId(projectOptions, current));
  }, [projectOptions, projectsQuery.data]);

  useEffect(() => {
    if (!tasksQuery.data) {
      return;
    }

    setSelectedTaskId((current) => resolveSelectedId(tasksQuery.data ?? [], current));
  }, [tasksQuery.data]);

  useEffect(() => {
    onGlobalInputEnabledChange?.(!commentModalOpen);
    return () => onGlobalInputEnabledChange?.(true);
  }, [commentModalOpen, onGlobalInputEnabledChange]);

  const performStatusAction = async (
    taskId: string,
    status: TaskStatus,
    successLabel: string,
  ): Promise<void> => {
    try {
      const updatedTask = await statusMutation.mutateAsync({ taskId, status });
      setConfirmCancel(false);
      setFeedback({ message: `Task ${successLabel}: ${updatedTask.title}`, tone: "success" });
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    } catch (error) {
      setFeedback({ message: formatToduClientError(error), tone: "error" });
    }
  };

  const submitComment = async (): Promise<void> => {
    if (!selectedTask) {
      setCommentModalOpen(false);
      setFeedback({ message: "No task selected for comment.", tone: "error" });
      return;
    }

    if (!statusActionsEnabled) {
      setCommentError("Task actions unavailable while daemon is disconnected.");
      return;
    }

    const content = normalizeCommentContent(commentText);
    if (!content) {
      setCommentError("Comment cannot be empty.");
      return;
    }

    try {
      await commentMutation.mutateAsync({ taskId: selectedTask.id, content });
      setCommentModalOpen(false);
      setCommentText("");
      setCommentError(null);
      setFeedback({ message: `Comment added: ${selectedTask.title}`, tone: "success" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.task(selectedTask.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.taskComments(selectedTask.id) }),
      ]);
    } catch (error) {
      setCommentError(formatToduClientError(error));
    }
  };

  const closeCommentModal = (): void => {
    setCommentModalOpen(false);
    setCommentText("");
    setCommentError(null);
    setFeedback({ message: "Cancelled comment.", tone: "info" });
  };

  useInput((input, key) => {
    if (commentModalOpen) {
      if (key.escape) {
        closeCommentModal();
        return;
      }

      if (key.return) {
        void submitComment();
        return;
      }

      if (key.backspace || key.delete) {
        setCommentText((current) => current.slice(0, -1));
        setCommentError(null);
        return;
      }

      if (!key.ctrl && !key.meta && input.length > 0) {
        setCommentText((current) => `${current}${input}`);
        setCommentError(null);
      }
      return;
    }

    if (confirmCancel) {
      if (input === "y" && selectedTask) {
        void performStatusAction(
          selectedTask.id,
          taskStatusActions.cancel.status,
          taskStatusActions.cancel.successLabel,
        );
        return;
      }

      if (input === "n" || input === "\u001B") {
        setConfirmCancel(false);
        setFeedback({ message: "Cancelled task action.", tone: "info" });
      }
      return;
    }

    if (taskDetailOpen && (key.escape || input === "\u001B")) {
      setTaskDetailOpen(false);
      return;
    }

    if (input === "h" || key.leftArrow) {
      setFocusedPane("projects");
      return;
    }

    if (input === "l" || key.rightArrow) {
      setFocusedPane("tasks");
      return;
    }

    if (focusedPane === "projects") {
      if (input === "j" || key.downArrow) {
        setSelectedProjectOptionId((current) =>
          moveTaskProjectOption(projectOptions, current, "next"),
        );
        setTaskDetailOpen(false);
        setFeedback(null);
        return;
      }

      if (input === "k" || key.upArrow) {
        setSelectedProjectOptionId((current) =>
          moveTaskProjectOption(projectOptions, current, "previous"),
        );
        setTaskDetailOpen(false);
        setFeedback(null);
        return;
      }

      if (key.return || input === "\r") {
        setFocusedPane("tasks");
        setFeedback(null);
        return;
      }
    }

    if (input === "c" && !selectedTask) {
      setFeedback({ message: "No task selected for comment.", tone: "error" });
      return;
    }

    if (tasks.length === 0) {
      return;
    }

    if (input === "c" && selectedTask) {
      if (!statusActionsEnabled) {
        setFeedback({
          message: "Task actions unavailable while daemon is disconnected.",
          tone: "error",
        });
        return;
      }

      setCommentModalOpen(true);
      setCommentText("");
      setCommentError(null);
      setFeedback(null);
      return;
    }

    if (focusedPane === "tasks" && !taskDetailOpen && (key.return || input === "\r")) {
      setTaskDetailOpen(true);
      return;
    }

    if (focusedPane === "tasks" && !taskDetailOpen && (input === "j" || key.downArrow)) {
      setSelectedTaskId((current) => moveSelection(tasks, current, "next"));
      return;
    }

    if (focusedPane === "tasks" && !taskDetailOpen && (input === "k" || key.upArrow)) {
      setSelectedTaskId((current) => moveSelection(tasks, current, "previous"));
      return;
    }

    const action = resolveTaskStatusAction(input);
    if (!action || !selectedTask || statusMutation.isPending) {
      return;
    }

    if (!statusActionsEnabled) {
      setFeedback({
        message: "Task actions unavailable while daemon is disconnected.",
        tone: "error",
      });
      return;
    }

    if (action.requiresConfirmation) {
      setConfirmCancel(true);
      setFeedback(null);
      return;
    }

    void performStatusAction(selectedTask.id, action.status, action.successLabel);
  });

  const maxVisibleListItems = resolveMaxVisibleListItems(stdout.rows);
  const maxProjectLabelLength = resolveProjectLabelLength(stdout.columns);
  const error = tasksQuery.error ?? projectsQuery.error;
  if (error) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box flexDirection="row" flexGrow={1}>
          <ProjectListPane
            projects={projectOptions}
            selectedProjectOptionId={selectedProjectOptionId}
            focused={focusedPane === "projects"}
            isLoading={projectsQuery.isLoading}
            maxVisibleProjects={maxVisibleListItems}
            maxProjectLabelLength={maxProjectLabelLength}
          />
          <Pane
            title="Tasks unavailable"
            width={TASK_MAIN_PANE_WIDTH}
            focused={focusedPane === "tasks"}
          >
            <Text color="red">Tasks unavailable</Text>
            <Text color="gray" wrap="truncate-end">
              {formatToduClientError(error)}
            </Text>
          </Pane>
        </Box>
        <ToastLine message={feedback?.message ?? null} tone={feedback?.tone ?? "info"} />
      </Box>
    );
  }

  if (tasksQuery.isLoading) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box flexDirection="row" flexGrow={1}>
          <ProjectListPane
            projects={projectOptions}
            selectedProjectOptionId={selectedProjectOptionId}
            focused={focusedPane === "projects"}
            isLoading={projectsQuery.isLoading}
            maxVisibleProjects={maxVisibleListItems}
            maxProjectLabelLength={maxProjectLabelLength}
          />
          <Pane
            title="Tasks • loading…"
            width={TASK_MAIN_PANE_WIDTH}
            focused={focusedPane === "tasks"}
          >
            <Text color="gray">Loading active, in-progress, and waiting tasks…</Text>
          </Pane>
        </Box>
        <ToastLine message={feedback?.message ?? null} tone={feedback?.tone ?? "info"} />
      </Box>
    );
  }

  if (tasks.length === 0) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box flexDirection="row" flexGrow={1}>
          <ProjectListPane
            projects={projectOptions}
            selectedProjectOptionId={selectedProjectOptionId}
            focused={focusedPane === "projects"}
            isLoading={projectsQuery.isLoading}
            maxVisibleProjects={maxVisibleListItems}
            maxProjectLabelLength={maxProjectLabelLength}
          />
          <Pane title="Tasks (0)" width={TASK_MAIN_PANE_WIDTH} focused={focusedPane === "tasks"}>
            <Text color="gray">
              No active, in-progress, or waiting tasks for{" "}
              {describeProjectFilter(selectedProjectFilter)}.
            </Text>
          </Pane>
        </Box>
        <ToastLine message={feedback?.message ?? null} tone={feedback?.tone ?? "info"} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexDirection="row" flexGrow={1}>
        <ProjectListPane
          projects={projectOptions}
          selectedProjectOptionId={selectedProjectOptionId}
          focused={focusedPane === "projects"}
          isLoading={projectsQuery.isLoading}
          maxVisibleProjects={maxVisibleListItems}
          maxProjectLabelLength={maxProjectLabelLength}
        />
        <Box flexDirection="column" width={TASK_MAIN_PANE_WIDTH}>
          <TaskListPane
            tasks={taskDetailOpen && selectedTask ? [selectedTask] : tasks}
            projects={projectsQuery.data}
            selectedTaskId={effectiveSelectedTaskId}
            width="100%"
            focused={focusedPane === "tasks"}
            maxVisibleTasks={maxVisibleListItems}
          />
          {taskDetailOpen ? (
            <TaskDetailPane
              task={selectedTask}
              detail={selectedDetailQuery.data}
              projects={projectsQuery.data}
              width="100%"
              isLoadingDetail={selectedDetailQuery.isLoading}
              comments={commentsQuery.data}
              isLoadingComments={commentsQuery.isLoading}
              error={selectedDetailQuery.error ?? commentsQuery.error}
            />
          ) : null}
        </Box>
      </Box>
      {commentModalOpen ? (
        <TextInputModal
          title={selectedTask ? `Comment on ${selectedTask.title}` : "Comment"}
          value={commentText}
          placeholder="Write a task comment…"
          error={commentError}
        />
      ) : null}
      {confirmCancel ? <ConfirmDialog message="Cancel selected task?" /> : null}
      <ToastLine message={feedback?.message ?? null} tone={feedback?.tone ?? "info"} />
    </Box>
  );
}

interface ProjectListPaneProps {
  projects: readonly ProjectOption[];
  selectedProjectOptionId: string;
  focused: boolean;
  isLoading?: boolean;
  maxVisibleProjects: number;
  maxProjectLabelLength: number;
}

function ProjectListPane({
  projects,
  selectedProjectOptionId,
  focused,
  isLoading = false,
  maxVisibleProjects,
  maxProjectLabelLength,
}: ProjectListPaneProps): JSX.Element {
  const visibleProjects = getVisibleTaskWindow(
    projects,
    selectedProjectOptionId,
    maxVisibleProjects,
  );

  return (
    <Pane
      title={`Projects${isLoading ? " • loading…" : ""}`}
      width={PROJECT_PANE_WIDTH}
      focused={focused}
    >
      {visibleProjects.map((option) => {
        const selected = option.id === selectedProjectOptionId;
        return (
          <Text
            key={option.id}
            color={selected ? "cyan" : undefined}
            inverse={selected && focused}
            wrap="truncate-end"
          >
            {selected ? ">" : " "} {truncateProjectLabel(option.label, maxProjectLabelLength)}
          </Text>
        );
      })}
    </Pane>
  );
}

function resolveProjectLabelLength(columns: number | undefined): number {
  const terminalColumns = columns && columns > 0 ? columns : 80;
  const appHorizontalPadding = 2;
  const projectPaneRightPadding = 1;
  const selectionPrefix = 2;
  const availableBodyColumns = Math.max(0, terminalColumns - appHorizontalPadding);
  const projectPaneColumns = Math.floor(availableBodyColumns * PROJECT_PANE_WIDTH_PERCENT);

  return Math.max(
    MIN_PROJECT_LABEL_LENGTH,
    projectPaneColumns - projectPaneRightPadding - selectionPrefix,
  );
}

function resolveMaxVisibleListItems(rows: number | undefined): number {
  const terminalRows = rows && rows > 0 ? rows : 24;

  // AppFrame reserves rows for padding, title, status, body margins, and footer.
  // Bordered panes reserve rows for borders and title.
  return Math.max(MIN_VISIBLE_LIST_ITEMS, terminalRows - 10);
}

function truncateProjectLabel(label: string, maxLength = 24): string {
  if (label.length <= maxLength) {
    return label;
  }

  if (maxLength <= 3) {
    return label.slice(0, maxLength);
  }

  return `${label.slice(0, maxLength - 3)}...`;
}

function createTaskProjectOptions(projects: readonly Project[]): ProjectOption[] {
  return [
    { id: ALL_PROJECTS_OPTION_ID, label: "All Projects", project: null },
    ...projects.map((project) => ({ id: project.id, label: project.name, project })),
  ];
}

function resolveTaskProjectOptionId(
  options: readonly ProjectOption[],
  currentOptionId: string,
): string {
  if (options.some((option) => option.id === currentOptionId)) {
    return currentOptionId;
  }

  return options[0]?.id ?? ALL_PROJECTS_OPTION_ID;
}

function moveTaskProjectOption(
  options: readonly ProjectOption[],
  currentOptionId: string,
  direction: "next" | "previous",
): string {
  if (options.length === 0) {
    return ALL_PROJECTS_OPTION_ID;
  }

  const currentIndex = Math.max(
    0,
    options.findIndex((option) => option.id === currentOptionId),
  );
  const delta = direction === "next" ? 1 : -1;
  const nextIndex = Math.max(0, Math.min(options.length - 1, currentIndex + delta));
  return options[nextIndex]?.id ?? ALL_PROJECTS_OPTION_ID;
}
