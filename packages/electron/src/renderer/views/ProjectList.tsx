import type { ReactNode } from "react";
import { useProjects } from "../hooks/useTodu.js";

function priorityClass(priority: string): string {
  switch (priority) {
    case "high":
      return "priority-high";
    case "medium":
      return "priority-medium";
    case "low":
      return "priority-low";
    default:
      return "";
  }
}

function statusClass(status: string): string {
  switch (status) {
    case "active":
      return "status-active";
    case "done":
      return "status-done";
    case "canceled":
      return "status-canceled";
    default:
      return "";
  }
}

export function ProjectList(): ReactNode {
  const { data: projects, isLoading, isError, error } = useProjects();

  if (isLoading) {
    return (
      <div className="view-container">
        <h2 className="view-title">Projects</h2>
        <div className="loading-state">Loading projects…</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="view-container">
        <h2 className="view-title">Projects</h2>
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
        <h2 className="view-title">Projects</h2>
        <div className="empty-state">
          <p>No projects yet</p>
          <p className="empty-hint">
            Create a project using the CLI: <code>toduai project create</code>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="view-container">
      <h2 className="view-title">Projects</h2>
      <table className="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => (
            <tr key={project.id}>
              <td className="cell-name">{project.name}</td>
              <td>
                <span className={`chip ${statusClass(project.status)}`}>{project.status}</span>
              </td>
              <td>
                <span className={`chip ${priorityClass(project.priority)}`}>
                  {project.priority}
                </span>
              </td>
              <td className="cell-date">{project.createdAt.slice(0, 10)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
