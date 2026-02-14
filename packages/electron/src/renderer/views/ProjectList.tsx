import type { ProjectFilter } from "@todu/core/browser";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { PriorityChip } from "../components/PriorityChip.js";
import { ProjectFilterBar } from "../components/ProjectFilterBar.js";
import { StatusChip } from "../components/StatusChip.js";
import { useProjects, useTasks } from "../hooks/useTodu.js";

export function ProjectList({
  onSelectProject,
  onCreateProject,
  externalFilter,
}: {
  onSelectProject: (id: string) => void;
  onCreateProject: () => void;
  externalFilter?: ProjectFilter | null;
}): ReactNode {
  const [filter, setFilter] = useState<ProjectFilter>({});
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

  if (isLoading) {
    return (
      <div className="view-container">
        <div className="view-header">
          <h2 className="view-title">Projects</h2>
        </div>
        <div className="loading-state">Loading projects…</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="view-container">
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

  if (!projects || projects.length === 0) {
    return (
      <div className="view-container">
        <div className="view-header">
          <h2 className="view-title">Projects</h2>
          <button type="button" className="btn btn-primary" onClick={onCreateProject}>
            + New Project
          </button>
        </div>
        <div className="empty-state">
          <p>No projects yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="view-container">
      <div className="view-header">
        <h2 className="view-title">Projects</h2>
        <button type="button" className="btn btn-primary" onClick={onCreateProject}>
          + New Project
        </button>
      </div>
      <ProjectFilterBar filter={filter} onFilterChange={setFilter} />
      {!projects || projects.length === 0 ? (
        <div className="empty-state">
          <p>No projects match your filters</p>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Tasks</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <tr
                key={project.id}
                className="clickable-row"
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
                <td className="cell-date">{project.createdAt.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
