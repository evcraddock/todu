import type { ProjectFilter, ProjectStatus, TaskPriority } from "@todu/core/browser";
import type { ReactNode } from "react";
import { Icon } from "./Icon.js";

export function ProjectFilterBar({
  filter,
  onFilterChange,
}: {
  filter: ProjectFilter;
  onFilterChange: (filter: ProjectFilter) => void;
}): ReactNode {
  const statuses = Array.isArray(filter.status)
    ? filter.status
    : filter.status
      ? [filter.status]
      : [];
  const statusValue =
    !statuses.length || statuses.length === 3
      ? "all"
      : statuses.length === 1
        ? statuses[0]
        : "custom";

  return (
    <div className="filter-bar list-filters">
      <input
        type="search"
        className="search-input"
        aria-label="Search projects"
        placeholder="Search projects…"
        value={filter.search ?? ""}
        onChange={(e) => onFilterChange({ ...filter, search: e.target.value || undefined })}
      />
      <div className="filter-row">
        <label className="list-filter-field">
          Status
          <select
            className="filter-select"
            value={statusValue}
            onChange={(e) =>
              onFilterChange({
                ...filter,
                status: e.target.value === "all" ? undefined : (e.target.value as ProjectStatus),
              })
            }
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="done">Done</option>
            <option value="canceled">Canceled</option>
            {statusValue === "custom" && (
              <option value="custom" disabled>
                Custom selection
              </option>
            )}
          </select>
        </label>
        <label className="list-filter-field">
          Priority
          <select
            className="filter-select"
            value={filter.priority ?? ""}
            onChange={(e) =>
              onFilterChange({ ...filter, priority: (e.target.value as TaskPriority) || undefined })
            }
          >
            <option value="">All priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <button
          type="button"
          className="btn btn-secondary btn-sm list-clear-filters btn-with-icon"
          onClick={() => onFilterChange({})}
        >
          <Icon name="clear-filters" /> Clear filters
        </button>
      </div>
    </div>
  );
}
