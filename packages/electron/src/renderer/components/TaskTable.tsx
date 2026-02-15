import type { Task, TaskSortField, TaskSortOptions } from "@todu/core/browser";
import type { ReactNode } from "react";
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
  const arrow = active ? (sort.direction === "asc" ? " ↑" : " ↓") : "";
  return (
    <th
      className="sortable-header"
      onClick={() => onSort(field)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSort(field);
      }}
    >
      {label}
      {arrow}
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
  projectMap,
  showProject = true,
}: {
  tasks: Task[];
  sort?: TaskSortOptions;
  onSort: (field: TaskSortField) => void;
  onSelectTask: (id: string) => void;
  projectMap: Map<string, string>;
  showProject?: boolean;
}): ReactNode {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <table className="data-table">
      <thead>
        <tr>
          <SortHeader label="Title" field="title" sort={sort} onSort={onSort} />
          <th>ID</th>
          <th>Status</th>
          <SortHeader label="Priority" field="priority" sort={sort} onSort={onSort} />
          {showProject && <th>Project</th>}
          <SortHeader label="Due" field="dueDate" sort={sort} onSort={onSort} />
          <SortHeader label="Created" field="createdAt" sort={sort} onSort={onSort} />
        </tr>
      </thead>
      <tbody>
        {tasks.map((task) => {
          const overdue =
            task.dueDate &&
            task.dueDate < today &&
            task.status !== "done" &&
            task.status !== "canceled";
          return (
            <tr
              key={task.id}
              className="clickable-row"
              onClick={() => onSelectTask(task.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSelectTask(task.id);
              }}
            >
              <td className="cell-name">{task.title}</td>
              <td className="cell-id">{task.id}</td>
              <td>
                <StatusChip status={task.status} />
              </td>
              <td>
                <PriorityChip priority={task.priority} />
              </td>
              {showProject && (
                <td className="cell-project">{projectMap.get(task.projectId) ?? "—"}</td>
              )}
              <td className={`cell-date ${overdue ? "cell-overdue" : ""}`}>
                {task.dueDate?.slice(0, 10) ?? "—"}
              </td>
              <td className="cell-date">{task.createdAt.slice(0, 10)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
