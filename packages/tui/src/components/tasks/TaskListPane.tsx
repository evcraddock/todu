import type { Project, Task } from "@todu/core";
import { Text } from "ink";
import type { JSX } from "react";
import { createProjectNameMap, formatTaskRow } from "../../formatting/task.js";
import { Pane } from "../Pane.js";

const DEFAULT_MAX_VISIBLE_TASKS = 12;

export interface TaskListPaneProps {
  tasks: readonly Task[];
  projects?: readonly Project[];
  selectedTaskId: string | null;
  width?: string;
  focused?: boolean;
  maxVisibleTasks?: number;
}

export function TaskListPane({
  tasks,
  projects,
  selectedTaskId,
  width = "50%",
  focused = true,
  maxVisibleTasks = DEFAULT_MAX_VISIBLE_TASKS,
}: TaskListPaneProps): JSX.Element {
  const projectNames = createProjectNameMap(projects);
  const visibleTasks = getVisibleTaskWindow(tasks, selectedTaskId, maxVisibleTasks);

  return (
    <Pane title={`Tasks (${tasks.length})`} width={width} focused={focused}>
      {visibleTasks.map((task) => {
        const selected = task.id === selectedTaskId;
        const prefix = selected ? ">" : " ";
        return (
          <Text
            key={task.id}
            color={selected ? "cyan" : undefined}
            inverse={selected && focused}
            wrap="truncate-end"
          >
            {prefix} {formatTaskRow(task, projectNames.get(task.projectId) ?? null)}
          </Text>
        );
      })}
    </Pane>
  );
}

export function getVisibleTaskWindow<T extends { id: string }>(
  tasks: readonly T[],
  selectedTaskId: string | null,
  maxVisible: number,
): readonly T[] {
  if (tasks.length <= maxVisible) {
    return tasks;
  }

  const selectedIndex = selectedTaskId
    ? Math.max(
        0,
        tasks.findIndex((task) => task.id === selectedTaskId),
      )
    : 0;
  const halfWindow = Math.floor(maxVisible / 2);
  const start = Math.min(Math.max(0, selectedIndex - halfWindow), tasks.length - maxVisible);

  return tasks.slice(start, start + maxVisible);
}
