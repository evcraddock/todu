import type { Task, TaskFilter, TaskSortField, TaskSortOptions } from "@todu/core/browser";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { FilterBar } from "../components/FilterBar.js";
import { TaskTable } from "../components/TaskTable.js";
import { useAgentSearch, useProjects, useTasks } from "../hooks/useTodu.js";
import { loadFilter, saveFilter } from "../lib/filter-persistence.js";
import { defaultTaskComparator } from "../lib/task-sort.js";

export function TaskList({
  onSelectTask,
  onCreateTask,
}: {
  onSelectTask: (id: string) => void;
  onCreateTask: () => void;
}): ReactNode {
  // Load persisted filter on mount
  const [filter, setFilter] = useState<TaskFilter>(loadFilter);
  const [sort, setSort] = useState<TaskSortOptions | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const [agentResults, setAgentResults] = useState<Task[] | null>(null);

  const { data: tasks, isLoading, isError, error } = useTasks(filter, sort);
  const { data: projects } = useProjects();
  const agentSearch = useAgentSearch();

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

  const handleAgentSearch = useCallback(
    (query: string) => {
      agentSearch.mutate(query, {
        onSuccess: (results) => {
          setAgentResults(results);
        },
      });
    },
    [agentSearch],
  );

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    // Clear agent results when user modifies the search
    if (query === "") {
      setAgentResults(null);
    }
  }, []);

  // Determine which tasks to display:
  // 1. Agent results if an AI search was performed
  // 2. Otherwise, filtered tasks with default sort applied
  const isAgentMode = agentResults !== null;
  const displayTasks = useMemo(() => {
    if (isAgentMode) return agentResults;
    if (!tasks) return undefined;
    // Apply default multi-field sort when no explicit sort is set
    if (!sort) {
      return [...tasks].sort(defaultTaskComparator);
    }
    return tasks;
  }, [isAgentMode, agentResults, tasks, sort]);

  if (isLoading && !isAgentMode) {
    return (
      <div className="view-container">
        <div className="view-header">
          <h2 className="view-title">Tasks</h2>
        </div>
        <div className="loading-state">Loading tasks…</div>
      </div>
    );
  }

  if (isError && !isAgentMode) {
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
        onSearchChange={handleSearchChange}
        onAgentSearch={handleAgentSearch}
        isAgentSearching={agentSearch.isPending}
        isAgentMode={isAgentMode}
      />
      {agentSearch.isError && (
        <div className="error-state">
          <p>AI search failed</p>
          <p className="error-detail">
            {agentSearch.error instanceof Error ? agentSearch.error.message : "Unknown error"}
          </p>
        </div>
      )}
      {!displayTasks || displayTasks.length === 0 ? (
        <div className="empty-state">
          <p>{isAgentMode ? "No tasks found for your search" : "No tasks match your filters"}</p>
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
