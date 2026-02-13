import type { TaskFilter, TaskSortField, TaskSortOptions } from "@todu/core/browser";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { FilterBar } from "../components/FilterBar.js";
import { TaskTable } from "../components/TaskTable.js";
import { useProjects, useSearchTasks, useTasks } from "../hooks/useTodu.js";

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
