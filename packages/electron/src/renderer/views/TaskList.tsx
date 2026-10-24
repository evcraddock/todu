import type { TaskFilter, TaskSortField, TaskSortOptions } from "@todu/core/browser";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FilterBar } from "../components/FilterBar.js";
import { Icon } from "../components/Icon.js";
import { TaskTable } from "../components/TaskTable.js";
import { useProjects, useTasks } from "../hooks/useTodu.js";
import {
  loadFilter,
  loadTaskSort,
  saveFilter,
  saveTaskSort,
  type TaskListFilter,
} from "../lib/filter-persistence.js";
import { matchesTaskAssignee } from "../lib/task-assignee-filter.js";
import { defaultTaskComparator } from "../lib/task-sort.js";
import { AssigneeDetail } from "./AssigneeDetail.js";

export function TaskList({
  onSelectTask,
  onCreateTask,
  externalFilter,
}: {
  onSelectTask: (id: string) => void;
  onCreateTask: () => void;
  externalFilter?: TaskFilter | null;
}): ReactNode {
  // Load persisted filter on mount
  const [filter, setFilter] = useState<TaskListFilter>(loadFilter);
  const [sort, setSort] = useState<TaskSortOptions | undefined>(loadTaskSort);
  const [openedAssigneeId, setOpenedAssigneeId] = useState<string | null>(null);

  // Track the last externalFilter we applied so we only react to new ones
  const appliedExternalRef = useRef<TaskFilter | null | undefined>(undefined);

  // Apply external filter when it changes (e.g., from agent ui-action)
  useEffect(() => {
    if (externalFilter && externalFilter !== appliedExternalRef.current) {
      appliedExternalRef.current = externalFilter;
      setFilter(externalFilter);
    }
  }, [externalFilter]);

  const { activeProjects, assignee, ...taskFilter } = filter;
  const { data: tasks, isLoading, isError, error } = useTasks(taskFilter, sort);
  const { data: projects } = useProjects();

  // Persist filter changes
  useEffect(() => {
    saveFilter(filter);
  }, [filter]);

  useEffect(() => {
    saveTaskSort(sort);
  }, [sort]);

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

  // Determine which tasks to display with default sort applied
  const displayTasks = useMemo(() => {
    if (!tasks) return undefined;
    const activeIds = new Set(projects?.filter((p) => p.status === "active").map((p) => p.id));
    const projectTasks =
      activeProjects && !filter.projectId
        ? tasks.filter((task) => activeIds.has(task.projectId))
        : tasks;
    const scopedTasks = projectTasks.filter((task) => matchesTaskAssignee(task, assignee));
    if (!sort) {
      return [...scopedTasks].sort(defaultTaskComparator);
    }
    return scopedTasks;
  }, [tasks, sort, projects, activeProjects, filter.projectId, assignee]);

  if (openedAssigneeId)
    return (
      <AssigneeDetail
        actorId={openedAssigneeId}
        backLabel="Tasks"
        onBack={() => setOpenedAssigneeId(null)}
      />
    );

  if (isError) {
    return (
      <div className="view-container list-view">
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
    <div className="view-container list-view">
      <div className="view-header">
        <h2 className="view-title">
          Tasks <span className="list-count">{displayTasks?.length ?? 0}</span>
        </h2>
        <button type="button" className="btn btn-primary btn-with-icon" onClick={onCreateTask}>
          <Icon name="add" /> New Task
        </button>
      </div>
      <FilterBar filter={filter} onFilterChange={setFilter} />
      <label className="list-sort-control">
        Sort by
        <select
          className="filter-select"
          value={sort ? `${sort.field}:${sort.direction}` : "default"}
          onChange={(e) => {
            if (e.target.value === "default") setSort(undefined);
            else {
              const [field, direction] = e.target.value.split(":");
              setSort({ field: field as TaskSortField, direction: direction as "asc" | "desc" });
            }
          }}
        >
          <option value="default">Due / scheduled date, then status and priority</option>
          <option value="dueDate:asc">Due date: earliest first</option>
          <option value="dueDate:desc">Due date: latest first</option>
          <option value="priority:desc">Priority: high first</option>
          <option value="priority:asc">Priority: low first</option>
          <option value="title:asc">Task: A–Z</option>
          <option value="title:desc">Task: Z–A</option>
          <option value="createdAt:desc">Created: newest first</option>
          <option value="createdAt:asc">Created: oldest first</option>
        </select>
      </label>
      {isLoading || (activeProjects && !projects) ? (
        <div className="loading-state">Loading tasks…</div>
      ) : !displayTasks || displayTasks.length === 0 ? (
        <div className="empty-state">
          <p>No tasks match your filters</p>
        </div>
      ) : (
        <TaskTable
          tasks={displayTasks}
          sort={sort}
          onSort={handleSort}
          onSelectTask={onSelectTask}
          onSelectAssignee={setOpenedAssigneeId}
          projectMap={projectMap}
          showProject={!filter.projectId}
        />
      )}
    </div>
  );
}
