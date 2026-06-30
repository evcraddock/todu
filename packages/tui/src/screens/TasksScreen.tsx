import { useQuery } from "@tanstack/react-query";
import { Box, Text, useInput } from "ink";
import type { JSX } from "react";
import { useEffect, useMemo, useState } from "react";
import { TaskDetailPane } from "../components/tasks/TaskDetailPane.js";
import { TaskListPane } from "../components/tasks/TaskListPane.js";
import { formatToduClientError, type TuiToduClient } from "../daemon/todu-client.js";
import { queryKeys } from "../state/query-keys.js";
import { getSelectedItem, moveSelection, resolveSelectedId } from "../state/selection.js";

export interface TasksScreenProps {
  client: TuiToduClient;
}

const visibleTaskStatuses = ["active", "inprogress", "waiting"] as const;

export function TasksScreen({ client }: TasksScreenProps): JSX.Element {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const tasksQuery = useQuery({
    queryKey: queryKeys.tasks({ status: [...visibleTaskStatuses] }),
    queryFn: () => client.task.list({ status: [...visibleTaskStatuses] }),
  });
  const projectsQuery = useQuery({
    queryKey: queryKeys.projects(),
    queryFn: () => client.project.list(),
  });
  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);
  const selectedTask = getSelectedItem(tasks, selectedTaskId);
  const selectedDetailQuery = useQuery({
    queryKey: queryKeys.task(selectedTaskId ?? "none"),
    queryFn: () => client.task.get(selectedTaskId ?? ""),
    enabled: selectedTaskId !== null,
  });

  useEffect(() => {
    if (!tasksQuery.data) {
      return;
    }

    setSelectedTaskId((current) => resolveSelectedId(tasksQuery.data ?? [], current));
  }, [tasksQuery.data]);

  useInput((input, key) => {
    if (tasks.length === 0) {
      return;
    }

    if (input === "j" || key.downArrow) {
      setSelectedTaskId((current) => moveSelection(tasks, current, "next"));
      return;
    }

    if (input === "k" || key.upArrow) {
      setSelectedTaskId((current) => moveSelection(tasks, current, "previous"));
    }
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
        <Text color="gray">No active, in-progress, or waiting tasks.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="row">
      <TaskListPane tasks={tasks} projects={projectsQuery.data} selectedTaskId={selectedTaskId} />
      <TaskDetailPane
        task={selectedTask}
        detail={selectedDetailQuery.data}
        projects={projectsQuery.data}
        isLoadingDetail={selectedDetailQuery.isLoading}
        error={selectedDetailQuery.error}
      />
    </Box>
  );
}
