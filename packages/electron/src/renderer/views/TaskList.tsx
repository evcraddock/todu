import type { Task, TaskFilter, TaskSortField, TaskSortOptions } from "@todu/core/browser";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { PriorityChip } from "../components/PriorityChip.js";
import { StatusChip } from "../components/StatusChip.js";
import { useProjects, useSearchTasks, useTasks } from "../hooks/useTodu.js";

// ============================================================================
// Filter Bar
// ============================================================================

const STATUS_OPTIONS = ["active", "inprogress", "waiting", "done", "canceled"] as const;

function FilterBar({
  filter,
  onFilterChange,
  searchQuery,
  onSearchChange,
}: {
  filter: TaskFilter;
  onFilterChange: (filter: TaskFilter) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}): ReactNode {
  const { data: projects } = useProjects();

  const toggleStatus = (status: string) => {
    const current = Array.isArray(filter.status)
      ? filter.status
      : filter.status
        ? [filter.status]
        : [];
    const next = current.includes(status as never)
      ? current.filter((s) => s !== status)
      : [...current, status];
    onFilterChange({ ...filter, status: next.length > 0 ? (next as never) : undefined });
  };

  return (
    <div className="filter-bar">
      <div className="filter-row">
        <input
          type="text"
          className="search-input"
          placeholder="Search tasks…"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        <select
          className="filter-select"
          value={filter.priority ?? ""}
          onChange={(e) =>
            onFilterChange({
              ...filter,
              priority: e.target.value ? (e.target.value as never) : undefined,
            })
          }
        >
          <option value="">All priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          className="filter-select"
          value={filter.projectId ?? ""}
          onChange={(e) =>
            onFilterChange({
              ...filter,
              projectId: e.target.value ? (e.target.value as never) : undefined,
            })
          }
        >
          <option value="">All projects</option>
          {projects?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <label className="filter-toggle">
          <input
            type="checkbox"
            checked={filter.overdue ?? false}
            onChange={(e) => onFilterChange({ ...filter, overdue: e.target.checked || undefined })}
          />
          Overdue
        </label>
        <label className="filter-toggle">
          <input
            type="checkbox"
            checked={filter.today ?? false}
            onChange={(e) => onFilterChange({ ...filter, today: e.target.checked || undefined })}
          />
          Today
        </label>
      </div>
      <div className="filter-status-chips">
        {STATUS_OPTIONS.map((s) => {
          const active = Array.isArray(filter.status)
            ? filter.status.includes(s as never)
            : filter.status === s;
          return (
            <button
              key={s}
              type="button"
              className={`chip chip-toggle ${active ? `status-${s}` : "chip-inactive"}`}
              onClick={() => toggleStatus(s)}
            >
              {s}
            </button>
          );
        })}
      </div>
    </div>
  );
}

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

function TaskTable({
  tasks,
  sort,
  onSort,
  onSelectTask,
  projectMap,
}: {
  tasks: Task[];
  sort?: TaskSortOptions;
  onSort: (field: TaskSortField) => void;
  onSelectTask: (id: string) => void;
  projectMap: Map<string, string>;
}): ReactNode {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <table className="data-table">
      <thead>
        <tr>
          <SortHeader label="Title" field="title" sort={sort} onSort={onSort} />
          <th>Status</th>
          <SortHeader label="Priority" field="priority" sort={sort} onSort={onSort} />
          <th>Project</th>
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
              <td>
                <StatusChip status={task.status} />
              </td>
              <td>
                <PriorityChip priority={task.priority} />
              </td>
              <td className="cell-project">{projectMap.get(task.projectId) ?? "—"}</td>
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

// ============================================================================
// Task List View
// ============================================================================

export function TaskList({
  onSelectTask,
  onCreateTask,
}: {
  onSelectTask: (id: string) => void;
  onCreateTask: () => void;
}): ReactNode {
  const [filter, setFilter] = useState<TaskFilter>({});
  const [sort, setSort] = useState<TaskSortOptions | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: tasks, isLoading, isError, error } = useTasks(filter, sort);
  const { data: searchResults } = useSearchTasks(searchQuery);
  const { data: projects } = useProjects();

  const projectMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects ?? []) {
      map.set(p.id, p.name);
    }
    return map;
  }, [projects]);

  const handleSort = useCallback(
    (field: TaskSortField) => {
      if (sort?.field === field) {
        setSort({ field, direction: sort.direction === "asc" ? "desc" : "asc" });
      } else {
        setSort({ field, direction: "asc" });
      }
    },
    [sort],
  );

  const displayTasks = searchQuery.length > 0 ? searchResults : tasks;

  if (isLoading) {
    return (
      <div className="view-container">
        <div className="view-header">
          <h2 className="view-title">Tasks</h2>
        </div>
        <div className="loading-state">Loading tasks…</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="view-container">
        <div className="view-header">
          <h2 className="view-title">Tasks</h2>
        </div>
        <div className="error-state">
          <p>Failed to load tasks</p>
          <p className="error-detail">{error instanceof Error ? error.message : "Unknown error"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="view-container">
      <div className="view-header">
        <h2 className="view-title">Tasks</h2>
        <button type="button" className="btn btn-primary" onClick={onCreateTask}>
          + New Task
        </button>
      </div>
      <FilterBar
        filter={filter}
        onFilterChange={setFilter}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />
      {!displayTasks || displayTasks.length === 0 ? (
        <div className="empty-state">
          <p>{searchQuery ? "No tasks match your search" : "No tasks match your filters"}</p>
        </div>
      ) : (
        <TaskTable
          tasks={displayTasks}
          sort={sort}
          onSort={handleSort}
          onSelectTask={onSelectTask}
          projectMap={projectMap}
        />
      )}
    </div>
  );
}
