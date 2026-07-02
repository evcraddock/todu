import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TaskStatus } from "@todu/core";
import { Box, Text, useInput } from "ink";
import type { JSX } from "react";
import { useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { TextInputModal } from "../components/TextInputModal.js";
import { ToastLine, type ToastTone } from "../components/ToastLine.js";
import { TaskDetailPane } from "../components/tasks/TaskDetailPane.js";
import { TaskListPane } from "../components/tasks/TaskListPane.js";
import { formatToduClientError, type TuiToduClient } from "../daemon/todu-client.js";
import { normalizeCommentContent } from "../state/comment-actions.js";
import { describeProjectFilter, type ProjectFilterState } from "../state/project-filter.js";
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

export function TasksScreen({
  client,
  projectFilter,
  statusActionsEnabled = true,
  dataQueriesEnabled = true,
  onGlobalInputEnabledChange,
}: TasksScreenProps): JSX.Element {
  const queryClient = useQueryClient();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [commentModalOpen, setCommentModalOpen] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; tone: ToastTone } | null>(null);
  const taskFilter = {
    status: [...visibleTaskStatuses],
    ...(projectFilter.projectId ? { projectId: projectFilter.projectId } : {}),
  };
  const tasksQuery = useQuery({
    queryKey: queryKeys.tasks(taskFilter),
    queryFn: () => client.task.list(taskFilter),
    enabled: dataQueriesEnabled,
  });
  const projectsQuery = useQuery({
    queryKey: queryKeys.projects(),
    queryFn: () => client.project.list(),
    enabled: dataQueriesEnabled,
  });
  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);
  const selectedTask = getSelectedItem(tasks, selectedTaskId);
  const selectedDetailQuery = useQuery({
    queryKey: queryKeys.task(selectedTaskId ?? "none"),
    queryFn: () => client.task.get(selectedTaskId ?? ""),
    enabled: dataQueriesEnabled && selectedTaskId !== null,
  });
  const commentsQuery = useQuery({
    queryKey: queryKeys.taskComments(selectedTaskId ?? "none"),
    queryFn: () => client.note.list({ entityType: "task", entityId: selectedTaskId ?? "" }),
    enabled: dataQueriesEnabled && selectedTaskId !== null,
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

    if (input === "j" || key.downArrow) {
      setSelectedTaskId((current) => moveSelection(tasks, current, "next"));
      return;
    }

    if (input === "k" || key.upArrow) {
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

  const error = tasksQuery.error ?? projectsQuery.error;
  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">Tasks unavailable</Text>
        <Text color="gray">{formatToduClientError(error)}</Text>
      </Box>
    );
  }

  if (tasksQuery.isLoading) {
    return <Text color="yellow">Loading tasks…</Text>;
  }

  if (tasks.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color="cyan">Tasks</Text>
        <Text color="gray">
          No active, in-progress, or waiting tasks for {describeProjectFilter(projectFilter)}.
        </Text>
        <ToastLine message={feedback?.message ?? null} tone={feedback?.tone ?? "info"} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <TaskListPane tasks={tasks} projects={projectsQuery.data} selectedTaskId={selectedTaskId} />
        <TaskDetailPane
          task={selectedTask}
          detail={selectedDetailQuery.data}
          projects={projectsQuery.data}
          isLoadingDetail={selectedDetailQuery.isLoading}
          comments={commentsQuery.data}
          isLoadingComments={commentsQuery.isLoading}
          error={selectedDetailQuery.error ?? commentsQuery.error}
        />
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
