import type { RecurringFilter } from "@todu/core/browser";
import { type ReactNode, useMemo, useState } from "react";
import { PriorityChip } from "../components/PriorityChip.js";
import { useProjects, useRecurringList } from "../hooks/useTodu.js";
import { describeSchedule } from "../lib/describe-schedule.js";

export function RecurringList({
  onSelectTemplate,
  onCreateTemplate,
}: {
  onSelectTemplate: (id: string) => void;
  onCreateTemplate: () => void;
}): ReactNode {
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "paused">("all");
  const [filterProject, setFilterProject] = useState("");

  const filter: RecurringFilter = {
    ...(filterStatus === "active" ? { paused: false } : {}),
    ...(filterStatus === "paused" ? { paused: true } : {}),
    ...(filterProject ? { projectId: filterProject as RecurringFilter["projectId"] } : {}),
  };

  const { data: templates, isLoading, isError, error } = useRecurringList(filter);
  const { data: projects } = useProjects();

  const projectMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects ?? []) map.set(p.id, p.name);
    return map;
  }, [projects]);

  if (isLoading) {
    return (
      <div className="view-container">
        <div className="view-header">
          <h2 className="view-title">Recurring Templates</h2>
        </div>
        <div className="loading-state">Loading templates…</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="view-container">
        <div className="view-header">
          <h2 className="view-title">Recurring Templates</h2>
        </div>
        <div className="error-state">
          <p>Failed to load templates</p>
          <p className="error-detail">{error instanceof Error ? error.message : "Unknown error"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="view-container">
      <div className="view-header">
        <h2 className="view-title">Recurring Templates</h2>
        <button type="button" className="btn btn-primary" onClick={onCreateTemplate}>
          + New Template
        </button>
      </div>

      <div className="filter-bar">
        <div className="filter-row">
          <select
            className="filter-select"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as "all" | "active" | "paused")}
          >
            <option value="all">All statuses</option>
            <option value="active">Active only</option>
            <option value="paused">Paused only</option>
          </select>
          <select
            className="filter-select"
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
          >
            <option value="">All projects</option>
            {projects?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!templates || templates.length === 0 ? (
        <div className="empty-state">
          <p>No recurring templates</p>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Schedule</th>
              <th>Project</th>
              <th>Priority</th>
              <th>Next Due</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr
                key={t.id}
                className="clickable-row"
                onClick={() => onSelectTemplate(t.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSelectTemplate(t.id);
                }}
              >
                <td className="cell-name">{t.title}</td>
                <td className="cell-schedule">{describeSchedule(t.schedule)}</td>
                <td className="cell-project">{projectMap.get(t.projectId) ?? "—"}</td>
                <td>
                  <PriorityChip priority={t.priority} />
                </td>
                <td className="cell-date">{t.nextDue?.slice(0, 10) ?? "—"}</td>
                <td>
                  <span className={`chip ${t.paused ? "status-paused" : "status-active"}`}>
                    {t.paused ? "paused" : "active"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
