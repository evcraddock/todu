import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Project, Task, TaskStatus } from "@todu/core";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import type { JSX } from "react";
import { useEffect, useMemo, useState } from "react";
import type { TasksFooterContext } from "../app/keymap.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { ListFilterModal } from "../components/ListFilterModal.js";
import { Pane } from "../components/Pane.js";
import { ToastLine, type ToastTone } from "../components/ToastLine.js";
import { TaskDetailPane } from "../components/tasks/TaskDetailPane.js";
import { getVisibleTaskWindow, TaskListPane } from "../components/tasks/TaskListPane.js";
import { formatToduClientError, type TuiToduClient } from "../daemon/todu-client.js";
import { composeTaskComment, normalizeCommentContent } from "../state/comment-actions.js";
import {
  createProjectListQuery,
  createTaskListQuery,
  defaultProjectListFilter,
  defaultTaskListFilter,
  formatProjectListFilter,
  matchesPriority,
  type ProjectListFilterState,
  type TaskListFilterState,
} from "../state/list-filter.js";
import { formatListWindowIndicator } from "../state/list-window.js";
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
  taskListFilter?: TaskListFilterState;
  projectListFilter?: ProjectListFilterState;
  onTaskListFilterChange?: (filter: TaskListFilterState) => void;
  onProjectListFilterChange?: (filter: ProjectListFilterState) => void;
  statusActionsEnabled?: boolean;
  dataQueriesEnabled?: boolean;
  onGlobalInputEnabledChange?: (enabled: boolean) => void;
  onProjectFilterChange?: (filter: ProjectFilterState) => void;
  onFooterContextChange?: (context: TasksFooterContext) => void;
  composeComment?: () => string | null;
}

const ALL_PROJECTS_OPTION_ID = "__all__";
const PROJECT_PANE_WIDTH_PERCENT = 0.36;
const TASK_MAIN_PANE_WIDTH_PERCENT = 0.64;
const PROJECT_PANE_WIDTH = "36%";
const TASK_MAIN_PANE_WIDTH = "64%";
const MIN_PROJECT_LABEL_LENGTH = 8;
const MIN_VISIBLE_LIST_ITEMS = 1;

type PaneFocus = "projects" | "tasks";

const taskStatusOptions = [
  { value: "active", label: "Active" },
  { value: "inprogress", label: "In Progress" },
  { value: "waiting", label: "Waiting" },
  { value: "done", label: "Done" },
  { value: "canceled", label: "Canceled" },
] as const;

const projectStatusOptions = [
  { value: "active", label: "Active" },
  { value: "done", label: "Done" },
  { value: "canceled", label: "Canceled" },
] as const;

interface ProjectOption {
  id: string;
  label: string;
  project: Project | null;
}

export function TasksScreen({
  client,
  projectFilter,
  taskListFilter: taskListFilterProp,
  projectListFilter: projectListFilterProp,
  onTaskListFilterChange,
  onProjectListFilterChange,
  statusActionsEnabled = true,
  dataQueriesEnabled = true,
  onGlobalInputEnabledChange,
  onProjectFilterChange,
  onFooterContextChange,
  composeComment = composeTaskComment,
}: TasksScreenProps): JSX.Element {
  const taskListFilter = taskListFilterProp ?? defaultTaskListFilter;
  const projectListFilter = projectListFilterProp ?? defaultProjectListFilter;
  const queryClient = useQueryClient();
  const { suspendTerminal } = useApp();
  const { stdout } = useStdout();
  const [selectedProjectOptionId, setSelectedProjectOptionId] = useState<string>(
    projectFilter.projectId ?? ALL_PROJECTS_OPTION_ID,
  );
  const [focusedPane, setFocusedPane] = useState<PaneFocus>("tasks");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; tone: ToastTone } | null>(null);
  const [filterModalTarget, setFilterModalTarget] = useState<PaneFocus | null>(null);
  const projectListQuery = createProjectListQuery(projectListFilter);
  const projectsQuery = useQuery({
    queryKey: queryKeys.projects(projectListQuery),
    queryFn: () => client.project.list(projectListQuery),
    enabled: dataQueriesEnabled,
  });
  const projectOptions = useMemo(
    () =>
      createTaskProjectOptions(
        (projectsQuery.data ?? []).filter((project) =>
          matchesPriority(project.priority, projectListFilter),
        ),
      ),
    [projectListFilter, projectsQuery.data],
  );
  const selectedProjectOption =
    projectOptions.find((option) => option.id === selectedProjectOptionId) ?? projectOptions[0];
  const selectedProjectFilter = projectFilterFromOption(selectedProjectOption);
  const taskFilter = createTaskListQuery(selectedProjectFilter, taskListFilter);
  const tasksQuery = useQuery({
    queryKey: queryKeys.tasks(taskFilter),
    queryFn: () => client.task.list(taskFilter),
    enabled: dataQueriesEnabled,
  });
  const tasks = useMemo(
    () => (tasksQuery.data ?? []).filter((task) => matchesPriority(task.priority, taskListFilter)),
    [taskListFilter, tasksQuery.data],
  );
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
    if (
      projectFilter.projectId &&
      projectsQuery.data &&
      !projectOptions.some((option) => option.project?.id === projectFilter.projectId)
    ) {
      onProjectFilterChange?.(allProjectsFilter);
    }
  }, [onProjectFilterChange, projectFilter.projectId, projectOptions, projectsQuery.data]);

  useEffect(() => {
    if (!tasksQuery.data) {
      return;
    }

    setSelectedTaskId((current) => resolveSelectedId(tasksQuery.data ?? [], current));
  }, [tasksQuery.data]);

  useEffect(() => {
    onGlobalInputEnabledChange?.(!confirmCancel && !filterModalTarget);
    return () => onGlobalInputEnabledChange?.(true);
  }, [confirmCancel, filterModalTarget, onGlobalInputEnabledChange]);

  const footerContext = resolveTasksFooterContext({
    confirmCancel,
    filterModalTarget,
    focusedPane,
    taskDetailOpen,
  });
  useEffect(() => {
    onFooterContextChange?.(footerContext);
  }, [footerContext, onFooterContextChange]);

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

  const submitComment = async (task: Task, content: string): Promise<void> => {
    try {
      await commentMutation.mutateAsync({ taskId: task.id, content });
      setFeedback({ message: `Comment added: ${task.title}`, tone: "success" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.task(task.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.taskComments(task.id) }),
      ]);
    } catch (error) {
      setFeedback({ message: formatToduClientError(error), tone: "error" });
    }
  };

  const openCommentEditor = async (task: Task): Promise<void> => {
    onGlobalInputEnabledChange?.(false);

    try {
      let composedContent: string | null = null;
      await suspendTerminal(() => {
        composedContent = composeComment();
      });
      const content = normalizeCommentContent(composedContent ?? "");
      if (!content) {
        setFeedback({ message: "Cancelled comment.", tone: "info" });
        return;
      }

      await submitComment(task, content);
    } catch (error) {
      setFeedback({ message: formatToduClientError(error), tone: "error" });
    } finally {
      onGlobalInputEnabledChange?.(true);
    }
  };

  useInput((input, key) => {
    if (filterModalTarget) {
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

    if (key.ctrl && input === "f" && !taskDetailOpen) {
      setFilterModalTarget(focusedPane);
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
        const nextProjectOptionId = moveTaskProjectOption(
          projectOptions,
          selectedProjectOptionId,
          "next",
        );
        setSelectedProjectOptionId(nextProjectOptionId);
        onProjectFilterChange?.(
          projectFilterFromOption(
            projectOptions.find((option) => option.id === nextProjectOptionId),
          ),
        );
        setTaskDetailOpen(false);
        setFeedback(null);
        return;
      }

      if (input === "k" || key.upArrow) {
        const nextProjectOptionId = moveTaskProjectOption(
          projectOptions,
          selectedProjectOptionId,
          "previous",
        );
        setSelectedProjectOptionId(nextProjectOptionId);
        onProjectFilterChange?.(
          projectFilterFromOption(
            projectOptions.find((option) => option.id === nextProjectOptionId),
          ),
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

      setFeedback(null);
      void openCommentEditor(selectedTask);
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

  if (filterModalTarget === "tasks") {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <ListFilterModal
          title="Filter tasks"
          statusOptions={taskStatusOptions}
          initialFilter={taskListFilter}
          defaultFilter={defaultTaskListFilter}
          onApply={(filter) => {
            onTaskListFilterChange?.(filter);
            setFilterModalTarget(null);
          }}
          onCancel={() => setFilterModalTarget(null)}
        />
      </Box>
    );
  }

  if (filterModalTarget === "projects") {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <ListFilterModal
          title="Filter projects"
          statusOptions={projectStatusOptions}
          initialFilter={projectListFilter}
          defaultFilter={defaultProjectListFilter}
          onApply={(filter) => {
            onProjectListFilterChange?.(filter);
            setFilterModalTarget(null);
          }}
          onCancel={() => setFilterModalTarget(null)}
        />
      </Box>
    );
  }

  const maxVisibleListItems = resolveMaxVisibleListItems(stdout.rows);
  const maxProjectLabelLength = resolveProjectLabelLength(stdout.columns);
  const detailContentWidth = resolveDetailContentWidth(stdout.columns);
  const detailContentRows = resolveDetailContentRows(stdout.rows);
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
            listFilter={projectListFilter}
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
            listFilter={projectListFilter}
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
            listFilter={projectListFilter}
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
          listFilter={projectListFilter}
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
              maxContentWidth={detailContentWidth}
              maxContentRows={detailContentRows}
              scrollEnabled={!confirmCancel}
            />
          ) : null}
        </Box>
      </Box>
      {filterModalTarget === "tasks" ? (
        <ListFilterModal
          title="Filter tasks"
          statusOptions={taskStatusOptions}
          initialFilter={taskListFilter}
          onApply={(filter) => {
            onTaskListFilterChange?.(filter);
            setFilterModalTarget(null);
          }}
          onCancel={() => setFilterModalTarget(null)}
        />
      ) : null}
      {filterModalTarget === "projects" ? (
        <ListFilterModal
          title="Filter projects"
          statusOptions={projectStatusOptions}
          initialFilter={projectListFilter}
          onApply={(filter) => {
            onProjectListFilterChange?.(filter);
            setFilterModalTarget(null);
          }}
          onCancel={() => setFilterModalTarget(null)}
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
  listFilter: ProjectListFilterState;
}

function ProjectListPane({
  projects,
  selectedProjectOptionId,
  focused,
  isLoading = false,
  maxVisibleProjects,
  maxProjectLabelLength,
  listFilter,
}: ProjectListPaneProps): JSX.Element {
  const projectWindow = getVisibleTaskWindow(projects, selectedProjectOptionId, maxVisibleProjects);
  const aboveIndicator = formatListWindowIndicator(projectWindow, "above");
  const belowIndicator = formatListWindowIndicator(projectWindow, "below");

  return (
    <Pane
      title={`Projects • ${formatProjectListFilter(listFilter)}${isLoading ? " • loading…" : ""}`}
      width={PROJECT_PANE_WIDTH}
      focused={focused}
    >
      {aboveIndicator ? <Text color="gray">{aboveIndicator}</Text> : null}
      {projectWindow.items.map((option) => {
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
      {belowIndicator ? <Text color="gray">{belowIndicator}</Text> : null}
    </Pane>
  );
}

function resolveDetailContentWidth(columns: number | undefined): number {
  const terminalColumns = columns && columns > 0 ? columns : 80;
  const appHorizontalPadding = 2;
  const paneBorderAndPadding = 4;
  const availableBodyColumns = Math.max(0, terminalColumns - appHorizontalPadding);
  const taskPaneColumns = Math.floor(availableBodyColumns * TASK_MAIN_PANE_WIDTH_PERCENT);

  return Math.max(8, taskPaneColumns - paneBorderAndPadding);
}

function resolveDetailContentRows(rows: number | undefined): number {
  const terminalRows = rows && rows > 0 ? rows : 24;

  // Reserve AppFrame rows, the selected-task pane, and detail pane chrome.
  return Math.max(6, terminalRows - 15);
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
  // Bordered panes and potential above/below indicators reserve four more rows.
  return Math.max(MIN_VISIBLE_LIST_ITEMS, terminalRows - 12);
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

function resolveTasksFooterContext({
  confirmCancel,
  filterModalTarget,
  focusedPane,
  taskDetailOpen,
}: {
  confirmCancel: boolean;
  filterModalTarget: PaneFocus | null;
  focusedPane: PaneFocus;
  taskDetailOpen: boolean;
}): TasksFooterContext {
  if (filterModalTarget) {
    return "filter-modal";
  }

  if (confirmCancel) {
    return "cancel-confirmation";
  }

  if (taskDetailOpen) {
    return "task-detail";
  }

  return focusedPane === "projects" ? "tasks-projects" : "tasks-list";
}

function projectFilterFromOption(option: ProjectOption | undefined): ProjectFilterState {
  return option?.project
    ? {
        projectId: option.project.id,
        projectName: option.project.name,
      }
    : allProjectsFilter;
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
