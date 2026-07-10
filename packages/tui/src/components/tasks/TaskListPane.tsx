import type { Project, Task } from "@todu/core";
import { Text } from "ink";
import type { JSX } from "react";
import { createProjectNameMap, formatTaskRow } from "../../formatting/task.js";
import {
  formatListWindowIndicator,
  getVisibleListWindow,
  type ListWindow,
} from "../../state/list-window.js";
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
  const taskWindow = getVisibleListWindow(tasks, selectedTaskId, maxVisibleTasks);
  const aboveIndicator = formatListWindowIndicator(taskWindow, "above");
  const belowIndicator = formatListWindowIndicator(taskWindow, "below");

  return (
    <Pane title={`Tasks (${tasks.length})`} width={width} focused={focused}>
      {aboveIndicator ? <Text color="gray">{aboveIndicator}</Text> : null}
      {taskWindow.items.map((task) => {
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
      {belowIndicator ? <Text color="gray">{belowIndicator}</Text> : null}
    </Pane>
  );
}

export function getVisibleTaskWindow<T extends { id: string }>(
  tasks: readonly T[],
  selectedTaskId: string | null,
  maxVisible: number,
): ListWindow<T> {
  return getVisibleListWindow(tasks, selectedTaskId, maxVisible);
}
