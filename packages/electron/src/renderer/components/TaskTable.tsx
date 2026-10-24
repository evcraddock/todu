import type { Task, TaskSortField, TaskSortOptions } from "@todu/core/browser";
import type { ReactNode } from "react";
import { useActors } from "../hooks/useTodu.js";
import { createActorMap, getActorNames } from "../lib/actors.js";
import { Icon } from "./Icon.js";
import { PriorityChip } from "./PriorityChip.js";
import { StatusChip } from "./StatusChip.js";

// ============================================================================
// Sortable Table Header
// ============================================================================

function SortHeader({
  label,
  field,
  sort,
  onSort,
}: {
  label: string;
  field: TaskSortField;
  sort?: TaskSortOptions;
  onSort: (field: TaskSortField) => void;
}): ReactNode {
  const active = sort?.field === field;
  return (
    <th
      className="sortable-header"
      tabIndex={0}
      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
      onClick={() => onSort(field)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSort(field);
      }}
    >
      {label}
      {active && <Icon name={sort.direction === "asc" ? "up" : "down"} size={14} />}
    </th>
  );
}

// ============================================================================
// Task Table
// ============================================================================

export function TaskTable({
  tasks,
  sort,
  onSort,
  onSelectTask,
  onSelectAssignee,
  projectMap,
  showProject = true,
}: {
  tasks: Task[];
  sort?: TaskSortOptions;
  onSort: (field: TaskSortField) => void;
  onSelectTask: (id: string) => void;
  onSelectAssignee?: (id: string) => void;
  projectMap: Map<string, string>;
  showProject?: boolean;
}): ReactNode {
  const today = new Date().toISOString().slice(0, 10);
  const { data: actors } = useActors();
  const actorMap = createActorMap(actors);

  return (
    <table className="data-table task-table">
      <thead>
        <tr>
          <SortHeader label="Task" field="title" sort={sort} onSort={onSort} />
          <th>Status</th>
          <th>Assignee</th>
          <SortHeader label="Priority" field="priority" sort={sort} onSort={onSort} />
          <SortHeader label="Due" field="dueDate" sort={sort} onSort={onSort} />
        </tr>
      </thead>
      <tbody>
        {tasks.map((task) => {
          const assigneeNames = getActorNames(
            task.assigneeActorIds ?? [],
            actorMap,
            task.assignees ?? [],
          );
          const overdue =
            task.dueDate &&
            task.dueDate < today &&
            task.status !== "done" &&
            task.status !== "canceled";
          return (
            <tr
              key={task.id}
              className="clickable-row"
              tabIndex={0}
              onClick={() => onSelectTask(task.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.target === e.currentTarget) onSelectTask(task.id);
              }}
            >
              <td className="cell-name">
                <span className="task-row-title">{task.title}</span>
                {showProject && (
                  <span className="task-row-project">{projectMap.get(task.projectId) ?? "—"}</span>
                )}
              </td>
              <td>
                <StatusChip status={task.status} />
              </td>
              <td className="cell-assignees">
                {assigneeNames.length > 0 ? (
                  assigneeNames.map((name, index) => {
                    const actorId = task.assigneeActorIds?.[index];
                    return (
                      <span key={actorId ?? `${name}-${index}`}>
                        {index > 0 && ", "}
                        {actorId && onSelectAssignee ? (
                          <button
                            type="button"
                            className="assignee-name-link"
                            onClick={(event) => {
                              event.stopPropagation();
                              onSelectAssignee(actorId);
                            }}
                          >
                            {name}
                          </button>
                        ) : (
                          name
                        )}
                      </span>
                    );
                  })
                ) : (
                  <span className="empty-hint">-</span>
                )}
              </td>
              <td>
                <PriorityChip priority={task.priority} />
              </td>
              <td className={`cell-date ${overdue ? "cell-overdue" : ""}`}>
                {task.dueDate?.slice(0, 10) ?? "—"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
