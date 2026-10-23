import type { TaskPriority, TaskStatus } from "@todu/core/browser";
import { createProjectId } from "@todu/core/browser";
import type { ReactNode } from "react";
import { useActors, useProjects } from "../hooks/useTodu.js";
import type { TaskListFilter } from "../lib/filter-persistence.js";

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "inprogress", label: "In progress" },
  { value: "waiting", label: "Waiting" },
  { value: "done", label: "Done" },
  { value: "canceled", label: "Canceled" },
];
const OPEN_STATUSES: TaskStatus[] = ["active", "inprogress", "waiting"];

export function FilterBar({
  filter,
  onFilterChange,
  hideProject = false,
  hideAssignee = false,
}: {
  filter: TaskListFilter;
  onFilterChange: (filter: TaskListFilter) => void;
  hideProject?: boolean;
  hideAssignee?: boolean;
}): ReactNode {
  const { data: projects } = useProjects();
  const { data: actors } = useActors();
  const statuses = Array.isArray(filter.status)
    ? filter.status
    : filter.status
      ? [filter.status]
      : [];
  const statusValue = !statuses.length
    ? "all"
    : statuses.length === 5
      ? "all"
      : statuses.length === 3 && OPEN_STATUSES.every((s) => statuses.includes(s))
        ? "open"
        : statuses.length === 1
          ? statuses[0]
          : "custom";

  return (
    <div className="filter-bar list-filters">
      <input
        className="search-input"
        type="search"
        aria-label="Search tasks"
        placeholder="Search tasks…"
        value={filter.search ?? ""}
        onChange={(e) => onFilterChange({ ...filter, search: e.target.value || undefined })}
      />
      <div className="filter-row">
        {!hideProject && (
          <label className="list-filter-field">
            Project
            <select
              className="filter-select"
              value={filter.projectId ?? (filter.activeProjects ? "active-projects" : "")}
              onChange={(e) =>
                onFilterChange({
                  ...filter,
                  projectId:
                    e.target.value && e.target.value !== "active-projects"
                      ? createProjectId(e.target.value)
                      : undefined,
                  activeProjects: e.target.value === "active-projects",
                })
              }
            >
              <option value="active-projects">Active Projects</option>
              <option value="">All projects</option>
              {projects?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="list-filter-field">
          Status
          <select
            className="filter-select"
            value={statusValue}
            onChange={(e) =>
              onFilterChange({
                ...filter,
                status:
                  e.target.value === "all"
                    ? undefined
                    : e.target.value === "open"
                      ? [...OPEN_STATUSES]
                      : (e.target.value as TaskStatus),
              })
            }
          >
            <option value="open">Open tasks</option>
            <option value="all">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
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
        {!hideAssignee && (
          <label className="list-filter-field">
            Assignee
            <select
              className="filter-select"
              value={filter.assignee ?? ""}
              onChange={(event) =>
                onFilterChange({ ...filter, assignee: event.target.value || undefined })
              }
            >
              <option value="">All assignees</option>
              <option value="unassigned">Unassigned</option>
              {[...(actors ?? [])]
                .sort(
                  (a, b) => a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id),
                )
                .map((actor) => (
                  <option key={actor.id} value={actor.id}>
                    {actor.displayName}
                    {actor.archived ? " (archived)" : ""}
                  </option>
                ))}
              {filter.assignee &&
                filter.assignee !== "unassigned" &&
                !actors?.some((actor) => actor.id === filter.assignee) && (
                  <option value={filter.assignee}>Unavailable assignee ({filter.assignee})</option>
                )}
            </select>
          </label>
        )}
        <label className="list-filter-field">
          When
          <select
            className="filter-select"
            value={
              filter.overdue && filter.today
                ? "both"
                : filter.overdue
                  ? "overdue"
                  : filter.today
                    ? "today"
                    : "any"
            }
            onChange={(e) =>
              onFilterChange({
                ...filter,
                overdue: e.target.value === "overdue" || undefined,
                today: e.target.value === "today" || undefined,
              })
            }
          >
            <option value="any">Any time</option>
            <option value="overdue">Overdue</option>
            <option value="today">Due or scheduled today</option>
            {filter.overdue && filter.today && (
              <option value="both" disabled>
                Overdue and today
              </option>
            )}
          </select>
        </label>
        <button
          type="button"
          className="btn btn-secondary btn-sm list-clear-filters"
          onClick={() => onFilterChange(hideProject ? {} : { activeProjects: false })}
        >
          Clear filters
        </button>
      </div>
    </div>
  );
}
