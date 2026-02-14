import type { TaskFilter, TaskPriority, TaskStatus } from "@todu/core/browser";
import { createProjectId } from "@todu/core/browser";
import { type ReactNode, useState } from "react";
import { useProjects } from "../hooks/useTodu.js";

const STATUS_OPTIONS: TaskStatus[] = ["active", "inprogress", "waiting", "done", "canceled"];

export function FilterBar({
  filter,
  onFilterChange,
  searchQuery,
  onSearchChange,
  onAgentSearch,
  isAgentSearching,
  isAgentMode,
  hideProject = false,
}: {
  filter: TaskFilter;
  onFilterChange: (filter: TaskFilter) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onAgentSearch: (query: string) => void;
  isAgentSearching: boolean;
  isAgentMode: boolean;
  hideProject?: boolean;
}): ReactNode {
  const { data: projects } = useProjects();
  const [showAdvanced, setShowAdvanced] = useState(false);

  const toggleStatus = (status: TaskStatus) => {
    const current: TaskStatus[] = Array.isArray(filter.status)
      ? filter.status
      : filter.status
        ? [filter.status]
        : [];
    const next = current.includes(status)
      ? current.filter((s) => s !== status)
      : [...current, status];
    onFilterChange({ ...filter, status: next.length > 0 ? next : undefined });
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && searchQuery.trim()) {
      e.preventDefault();
      onAgentSearch(searchQuery.trim());
    }
  };

  return (
    <div className="filter-bar">
      <div className="filter-row">
        <div className="search-wrapper">
          <input
            type="text"
            className={`search-input ${isAgentMode ? "search-input-agent" : ""}`}
            placeholder={
              isAgentMode
                ? "AI search active — edit and press Enter"
                : "Search tasks… (Enter for AI search)"
            }
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            disabled={isAgentSearching}
          />
          {isAgentSearching && <span className="search-spinner">⏳</span>}
          {isAgentMode && !isAgentSearching && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => onSearchChange("")}
              title="Clear AI search"
            >
              ✕
            </button>
          )}
        </div>
        <button
          type="button"
          className={`btn btn-sm ${showAdvanced ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setShowAdvanced(!showAdvanced)}
          disabled={isAgentMode}
          title={isAgentMode ? "Filters disabled during AI search" : "Toggle advanced filters"}
        >
          Filters {showAdvanced ? "▾" : "▸"}
        </button>
      </div>

      {showAdvanced && !isAgentMode && (
        <div className="filter-advanced">
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
          {!hideProject && (
            <select
              className="filter-select"
              value={filter.projectId ?? ""}
              onChange={(e) =>
                onFilterChange({
                  ...filter,
                  projectId: e.target.value ? createProjectId(e.target.value) : undefined,
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
          )}
          <label className="filter-toggle">
            <input
              type="checkbox"
              checked={filter.overdue ?? false}
              onChange={(e) =>
                onFilterChange({ ...filter, overdue: e.target.checked || undefined })
              }
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
      )}

      {!isAgentMode && (
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
      )}
    </div>
  );
}
