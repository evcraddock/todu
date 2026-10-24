import type { ProjectFilter } from "@todu/core/browser";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon.js";
import { PriorityChip } from "../components/PriorityChip.js";
import { ProjectFilterBar } from "../components/ProjectFilterBar.js";
import { StatusChip } from "../components/StatusChip.js";
import { useSavedSelection } from "../hooks/useSavedSelection.js";
import { useProjects, useTasks } from "../hooks/useTodu.js";
import { loadProjectFilter, saveProjectFilter } from "../lib/filter-persistence.js";

export function ProjectList({
  onSelectProject,
  onCreateProject,
  externalFilter,
}: {
  onSelectProject: (id: string) => void;
  onCreateProject: () => void;
  externalFilter?: ProjectFilter | null;
}): ReactNode {
  const [filter, setFilter] = useState<ProjectFilter>(() => loadProjectFilter());
  const [sort, setSort] = useSavedSelection<string>("projects:sort", "name", [
    "name",
    "priority",
    "tasks",
    "created",
  ]);
  useEffect(() => {
    saveProjectFilter(filter);
  }, [filter]);
  const appliedExternalRef = useRef<ProjectFilter | null | undefined>(undefined);

  // Apply external filter when it changes (e.g., from agent ui-action)
  useEffect(() => {
    if (externalFilter && externalFilter !== appliedExternalRef.current) {
      appliedExternalRef.current = externalFilter;
      setFilter(externalFilter);
    }
  }, [externalFilter]);

  const { data: projects, isLoading, isError, error } = useProjects(filter);
  const { data: allTasks } = useTasks();

  // Count tasks per project
  const taskCounts = new Map<string, number>();
  for (const task of allTasks ?? []) {
    taskCounts.set(task.projectId, (taskCounts.get(task.projectId) ?? 0) + 1);
  }

  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const displayProjects = [...(projects ?? [])].sort((a, b) => {
    if (sort === "priority")
      return priorityOrder[a.priority] - priorityOrder[b.priority] || a.name.localeCompare(b.name);
    if (sort === "tasks")
      return (
        (taskCounts.get(b.id) ?? 0) - (taskCounts.get(a.id) ?? 0) || a.name.localeCompare(b.name)
      );
    if (sort === "created")
      return b.createdAt.localeCompare(a.createdAt) || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name);
  });

  if (isError) {
    return (
      <div className="view-container list-view">
        <div className="view-header">
          <h2 className="view-title">Projects</h2>
        </div>
        <div className="error-state">
          <p>Failed to load projects</p>
          <p className="error-detail">{error instanceof Error ? error.message : "Unknown error"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="view-container list-view">
      <div className="view-header">
        <h2 className="view-title">
          Projects <span className="list-count">{displayProjects.length}</span>
        </h2>
        <button type="button" className="btn btn-primary btn-with-icon" onClick={onCreateProject}>
          <Icon name="add" /> New Project
        </button>
      </div>
      <ProjectFilterBar filter={filter} onFilterChange={setFilter} />
      <label className="list-sort-control">
        Sort by
        <select className="filter-select" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="name">Project: A–Z</option>
          <option value="priority">Priority: high first</option>
          <option value="tasks">Tasks: most first</option>
          <option value="created">Created: newest first</option>
        </select>
      </label>
      {isLoading ? (
        <div className="loading-state">Loading projects…</div>
      ) : displayProjects.length === 0 ? (
        <div className="empty-state">
          <p>No projects match your filters</p>
        </div>
      ) : (
        <table className="data-table project-list-table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Tasks</th>
            </tr>
          </thead>
          <tbody>
            {displayProjects.map((project) => (
              <tr
                key={project.id}
                className="clickable-row"
                tabIndex={0}
                onClick={() => onSelectProject(project.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSelectProject(project.id);
                }}
              >
                <td className="cell-name">{project.name}</td>
                <td>
                  <StatusChip status={project.status} />
                </td>
                <td>
                  <PriorityChip priority={project.priority} />
                </td>
                <td className="cell-count">{taskCounts.get(project.id) ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
