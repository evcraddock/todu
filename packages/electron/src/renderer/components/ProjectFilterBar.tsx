import type { ProjectFilter, ProjectStatus, TaskPriority } from "@todu/core/browser";
import type { ReactNode } from "react";

const STATUS_OPTIONS: ProjectStatus[] = ["active", "done", "canceled"];

export function ProjectFilterBar({
  filter,
  onFilterChange,
}: {
  filter: ProjectFilter;
  onFilterChange: (filter: ProjectFilter) => void;
}): ReactNode {
  const toggleStatus = (status: ProjectStatus) => {
    const current: ProjectStatus[] = Array.isArray(filter.status)
      ? filter.status
      : filter.status
        ? [filter.status]
        : [];
    const next = current.includes(status)
      ? current.filter((s) => s !== status)
      : [...current, status];
    onFilterChange({ ...filter, status: next.length > 0 ? next : undefined });
  };

  return (
    <div className="filter-bar">
      <div className="filter-row">
        <input
          type="text"
          className="search-input"
          placeholder="Search projects…"
          value={filter.search ?? ""}
          onChange={(e) => onFilterChange({ ...filter, search: e.target.value || undefined })}
        />
        <select
          className="filter-select"
          value={filter.priority ?? ""}
          onChange={(e) =>
            onFilterChange({
              ...filter,
              priority: (e.target.value as TaskPriority) || undefined,
            })
          }
        >
          <option value="">All priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      <div className="filter-status-chips">
        {STATUS_OPTIONS.map((s) => {
          const active = Array.isArray(filter.status)
            ? filter.status.includes(s)
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
