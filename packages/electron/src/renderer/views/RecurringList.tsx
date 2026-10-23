import type { RecurringFilter } from "@todu/core/browser";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { PriorityChip } from "../components/PriorityChip.js";
import { useProjects, useRecurringList } from "../hooks/useTodu.js";
import { describeSchedule } from "../lib/describe-schedule.js";
import {
  getRecurringMissPolicy,
  getRecurringMissPolicyExplanation,
  getRecurringMissPolicyShortLabel,
} from "../lib/recurring-miss-policy.js";

export function RecurringList({
  onSelectTemplate,
  onCreateTemplate,
  externalFilter,
}: {
  onSelectTemplate: (id: string) => void;
  onCreateTemplate: () => void;
  externalFilter?: RecurringFilter | null;
}): ReactNode {
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "paused">("all");
  const [filterProject, setFilterProject] = useState("active-projects");
  const [searchText, setSearchText] = useState("");
  const [sort, setSort] = useState("name");
  const appliedExternalRef = useRef<RecurringFilter | null | undefined>(undefined);

  // Apply external filter when it changes (e.g., from agent ui-action)
  useEffect(() => {
    if (externalFilter && externalFilter !== appliedExternalRef.current) {
      appliedExternalRef.current = externalFilter;
      if (externalFilter.paused === true) setFilterStatus("paused");
      else if (externalFilter.paused === false) setFilterStatus("active");
      else setFilterStatus("all");
      setFilterProject((externalFilter.projectId as string) ?? "");
      setSearchText(externalFilter.search ?? "");
    }
  }, [externalFilter]);

  const filter: RecurringFilter = {
    ...(filterStatus === "active" ? { paused: false } : {}),
    ...(filterStatus === "paused" ? { paused: true } : {}),
    ...(filterProject && filterProject !== "active-projects"
      ? { projectId: filterProject as RecurringFilter["projectId"] }
      : {}),
    ...(searchText ? { search: searchText } : {}),
  };

  const { data: templates, isLoading, isError, error } = useRecurringList(filter);
  const { data: projects, isError: projectsError, error: projectError } = useProjects();
  const activeProjectsOnly = filterProject === "active-projects";
  const activeProjectIds = new Set(
    projects?.filter((project) => project.status === "active").map((project) => project.id),
  );

  const projectMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects ?? []) map.set(p.id, p.name);
    return map;
  }, [projects]);

  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const displayTemplates = [...(templates ?? [])]
    .filter((item) => !activeProjectsOnly || activeProjectIds.has(item.projectId))
    .sort((a, b) => {
      if (sort === "nextDue")
        return (
          (a.nextDue || "9999").localeCompare(b.nextDue || "9999") || a.title.localeCompare(b.title)
        );
      if (sort === "priority")
        return (
          priorityOrder[a.priority] - priorityOrder[b.priority] || a.title.localeCompare(b.title)
        );
      if (sort === "status")
        return Number(a.paused) - Number(b.paused) || a.title.localeCompare(b.title);
      return a.title.localeCompare(b.title);
    });

  if (isError || (activeProjectsOnly && projectsError)) {
    const loadError = isError ? error : projectError;
    return (
      <div className="view-container list-view">
        <div className="view-header">
          <h2 className="view-title">Recurring Tasks</h2>
        </div>
        <div className="error-state">
          <p>Failed to load recurring tasks</p>
          <p className="error-detail">
            {loadError instanceof Error ? loadError.message : "Unknown error"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="view-container list-view">
      <div className="view-header">
        <h2 className="view-title">
          Recurring Tasks <span className="list-count">{displayTemplates.length}</span>
        </h2>
        <button type="button" className="btn btn-primary" onClick={onCreateTemplate}>
          + New Recurring Task
        </button>
      </div>

      <div className="filter-bar list-filters">
        <input
          type="search"
          className="search-input"
          aria-label="Search recurring tasks"
          placeholder="Search recurring tasks…"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        <div className="filter-row">
          <label className="list-filter-field">
            Project
            <select
              className="filter-select"
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
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
          <label className="list-filter-field">
            Status
            <select
              className="filter-select"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as "all" | "active" | "paused")}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
            </select>
          </label>
          <button
            type="button"
            className="btn btn-secondary btn-sm list-clear-filters"
            onClick={() => {
              setFilterStatus("all");
              setFilterProject("");
              setSearchText("");
            }}
          >
            Clear filters
          </button>
        </div>
      </div>
      <label className="list-sort-control">
        Sort by
        <select className="filter-select" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="name">Recurring task: A–Z</option>
          <option value="nextDue">Next due: earliest first</option>
          <option value="priority">Priority: high first</option>
          <option value="status">Status: active first</option>
        </select>
      </label>
      {isLoading || (activeProjectsOnly && !projects) ? (
        <div className="loading-state">Loading recurring tasks…</div>
      ) : displayTemplates.length === 0 ? (
        <div className="empty-state">
          <p>No recurring tasks match your filters</p>
        </div>
      ) : (
        <table className="data-table recurring-table">
          <thead>
            <tr>
              <th>Recurring task</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Miss Policy</th>
              <th>Next due</th>
            </tr>
          </thead>
          <tbody>
            {displayTemplates.map((t) => {
              const missPolicy = getRecurringMissPolicy(t);
              return (
                <tr
                  key={t.id}
                  className="clickable-row"
                  tabIndex={0}
                  onClick={() => onSelectTemplate(t.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onSelectTemplate(t.id);
                  }}
                >
                  <td className="cell-name">
                    <span className="habit-row-title">{t.title}</span>
                    <span className="habit-row-context">
                      {(!filterProject || activeProjectsOnly) && (
                        <>{projectMap.get(t.projectId) ?? "Project unavailable"} · </>
                      )}
                      {describeSchedule(t.schedule)}
                    </span>
                  </td>
                  <td>
                    <span className={`chip ${t.paused ? "status-paused" : "status-active"}`}>
                      {t.paused ? "Paused" : "Active"}
                    </span>
                  </td>
                  <td>
                    <PriorityChip priority={t.priority} />
                  </td>
                  <td aria-label={`Miss Policy ${missPolicy}`}>
                    <div
                      className="recurring-policy-label"
                      title={getRecurringMissPolicyExplanation(missPolicy)}
                    >
                      {getRecurringMissPolicyShortLabel(missPolicy)}
                    </div>
                  </td>
                  <td className="cell-date">{t.nextDue?.slice(0, 10) ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
