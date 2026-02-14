import type { TaskFilter, TaskSortField, TaskSortOptions } from "@todu/core/browser";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FilterBar } from "../components/FilterBar.js";
import { TaskTable } from "../components/TaskTable.js";
import { useProjects, useTasks } from "../hooks/useTodu.js";
import { loadFilter, saveFilter } from "../lib/filter-persistence.js";
import { defaultTaskComparator } from "../lib/task-sort.js";

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
  const [filter, setFilter] = useState<TaskFilter>(loadFilter);
  const [sort, setSort] = useState<TaskSortOptions | undefined>(undefined);

  // Track the last externalFilter we applied so we only react to new ones
  const appliedExternalRef = useRef<TaskFilter | null | undefined>(undefined);

  // Apply external filter when it changes (e.g., from agent ui-action)
  useEffect(() => {
    if (externalFilter && externalFilter !== appliedExternalRef.current) {
      appliedExternalRef.current = externalFilter;
      setFilter(externalFilter);
    }
  }, [externalFilter]);

  const { data: tasks, isLoading, isError, error } = useTasks(filter, sort);
  const { data: projects } = useProjects();

  // Persist filter changes
  useEffect(() => {
    saveFilter(filter);
  }, [filter]);

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
    if (!sort) {
      return [...tasks].sort(defaultTaskComparator);
    }
    return tasks;
  }, [tasks, sort]);

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
      <FilterBar filter={filter} onFilterChange={setFilter} />
      {!displayTasks || displayTasks.length === 0 ? (
        <div className="empty-state">
          <p>No tasks match your filters</p>
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
