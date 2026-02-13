import { type RecurringId, createProjectId } from "@todu/core/browser";
import { type ReactNode, useMemo, useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { PriorityChip } from "../components/PriorityChip.js";
import { SchedulePresetPicker } from "../components/SchedulePresetPicker.js";
import {
  useDeleteRecurring,
  useGenerateOccurrence,
  usePauseRecurring,
  useProjects,
  useRecurringDetail,
  useResumeRecurring,
  useUpcoming,
  useUpdateRecurring,
} from "../hooks/useTodu.js";
import { describeSchedule } from "../lib/describe-schedule.js";

// ============================================================================
// Upcoming Occurrences
// ============================================================================

function UpcomingSection({ templateId }: { templateId: string }): ReactNode {
  const { data: upcoming, isLoading } = useUpcoming({ templateId, days: 30 });
  const generate = useGenerateOccurrence();
  const [generated, setGenerated] = useState<Map<string, string>>(new Map());

  const handleGenerate = (date: string) => {
    generate.mutate(
      { templateId: templateId as RecurringId, date },
      {
        onSuccess: (task) => {
          setGenerated((prev) => new Map(prev).set(date, task.id));
        },
      },
    );
  };

  if (isLoading) return <div className="loading-state">Loading upcoming…</div>;
  if (!upcoming || upcoming.length === 0)
    return <div className="empty-hint">No upcoming occurrences</div>;

  return (
    <table className="data-table data-table-compact">
      <thead>
        <tr>
          <th>Date</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        {upcoming.map((occ) => {
          const taskId = generated.get(occ.date);
          return (
            <tr key={occ.date}>
              <td className="cell-date">{occ.date}</td>
              <td>
                {taskId ? (
                  <span className="generated-tag">✓ Task created: {taskId.slice(0, 12)}…</span>
                ) : (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleGenerate(occ.date)}
                    disabled={generate.isPending}
                  >
                    Generate
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ============================================================================
// Skip List
// ============================================================================

function SkipList({ dates }: { dates: string[] }): ReactNode {
  if (dates.length === 0) return <div className="empty-hint">No skipped dates</div>;
  return (
    <div className="skip-list">
      {dates.map((d) => (
        <span key={d} className="chip chip-inactive">
          {d}
        </span>
      ))}
    </div>
  );
}

// ============================================================================
// Recurring Detail View
// ============================================================================

export function RecurringDetail({
  templateId,
  onBack,
}: {
  templateId: string;
  onBack: () => void;
}): ReactNode {
  const { data: template, isLoading, isError, error } = useRecurringDetail(templateId);
  const { data: projects } = useProjects();
  const updateRecurring = useUpdateRecurring();
  const deleteRecurring = useDeleteRecurring();
  const pauseRecurring = usePauseRecurring();
  const resumeRecurring = useResumeRecurring();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const projectMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects ?? []) map.set(p.id, p.name);
    return map;
  }, [projects]);

  if (isLoading) {
    return (
      <div className="view-container">
        <div className="loading-state">Loading template…</div>
      </div>
    );
  }

  if (isError || !template) {
    return (
      <div className="view-container">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onBack}>
          ← Back
        </button>
        <div className="error-state">
          <p>Failed to load template</p>
          <p className="error-detail">
            {error instanceof Error ? error.message : "Template not found"}
          </p>
        </div>
      </div>
    );
  }

  const handleInlineEdit = (field: string, currentValue: string) => {
    setEditingField(field);
    setEditValue(currentValue);
  };

  const handleInlineSave = (field: string) => {
    setEditingField(null);
    if (editValue !== (template as Record<string, unknown>)[field]) {
      updateRecurring.mutate({
        id: template.id as RecurringId,
        input: { [field]: editValue },
      });
    }
  };

  const handleDelete = () => {
    deleteRecurring.mutate(template.id as RecurringId, { onSuccess: onBack });
  };

  const handlePauseToggle = () => {
    if (template.paused) {
      resumeRecurring.mutate(template.id as RecurringId);
    } else {
      pauseRecurring.mutate(template.id as RecurringId);
    }
  };

  return (
    <div className="view-container">
      <div className="detail-toolbar">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onBack}>
          ← Back
        </button>
        <div className="toolbar-actions">
          <button
            type="button"
            className={`btn btn-sm ${template.paused ? "btn-primary" : "btn-secondary"}`}
            onClick={handlePauseToggle}
          >
            {template.paused ? "▶ Resume" : "⏸ Pause"}
          </button>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={() => setShowDeleteConfirm(true)}
          >
            Delete
          </button>
        </div>
      </div>

      {/* Title */}
      <div className="detail-title-row">
        {editingField === "title" ? (
          <input
            className="input detail-title-input"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => handleInlineSave("title")}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleInlineSave("title");
              if (e.key === "Escape") setEditingField(null);
            }}
            autoFocus
          />
        ) : (
          <button
            type="button"
            className="detail-title clickable"
            onClick={() => handleInlineEdit("title", template.title)}
          >
            {template.title}
            {template.paused && (
              <span className="chip status-paused detail-paused-badge">paused</span>
            )}
          </button>
        )}
      </div>

      {/* Schedule */}
      <div className="detail-field">
        <span className="detail-label">Schedule</span>
        {editingField === "schedule" ? (
          <div className="inline-schedule-edit">
            <SchedulePresetPicker value={editValue} onChange={(v) => setEditValue(v)} />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                setEditingField(null);
                if (editValue !== template.schedule) {
                  updateRecurring.mutate({
                    id: template.id as RecurringId,
                    input: { schedule: editValue },
                  });
                }
              }}
            >
              Save
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setEditingField(null)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="clickable-value"
            onClick={() => handleInlineEdit("schedule", template.schedule)}
          >
            {describeSchedule(template.schedule)}
          </button>
        )}
      </div>

      {/* Priority */}
      <div className="detail-field">
        <span className="detail-label">Priority</span>
        <select
          className="filter-select inline-select"
          value={template.priority}
          onChange={(e) =>
            updateRecurring.mutate({
              id: template.id as RecurringId,
              input: { priority: e.target.value as "high" | "medium" | "low" },
            })
          }
        >
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {/* Project */}
      <div className="detail-field">
        <span className="detail-label">Project</span>
        <select
          className="filter-select inline-select"
          value={template.projectId}
          onChange={(e) =>
            updateRecurring.mutate({
              id: template.id as RecurringId,
              input: { projectId: createProjectId(e.target.value) },
            })
          }
        >
          {projects?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Dates */}
      <div className="detail-field">
        <span className="detail-label">Start Date</span>
        <span>{template.startDate}</span>
      </div>
      {template.endDate && (
        <div className="detail-field">
          <span className="detail-label">End Date</span>
          <span>{template.endDate}</span>
        </div>
      )}
      <div className="detail-field">
        <span className="detail-label">Next Due</span>
        <span>{template.nextDue ?? "—"}</span>
      </div>
      <div className="detail-field">
        <span className="detail-label">Timezone</span>
        <span>{template.timezone}</span>
      </div>

      {/* Labels */}
      <div className="detail-field">
        <span className="detail-label">Labels</span>
        <div className="label-chips">
          {template.labels.length > 0 ? (
            template.labels.map((l) => (
              <span key={l} className="chip chip-label">
                {l}
              </span>
            ))
          ) : (
            <span className="empty-hint">None</span>
          )}
        </div>
      </div>

      {/* Description */}
      <div className="detail-section">
        <h3 className="section-title">Description</h3>
        {editingField === "description" ? (
          <textarea
            className="input detail-description-input"
            rows={3}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => handleInlineSave("description")}
            autoFocus
          />
        ) : (
          <button
            type="button"
            className="detail-description clickable"
            onClick={() => handleInlineEdit("description", template.description ?? "")}
          >
            {template.description || <span className="empty-hint">Click to add description…</span>}
          </button>
        )}
      </div>

      {/* Metadata */}
      <div className="detail-meta">
        <span>Created: {template.createdAt.slice(0, 10)}</span>
        <span>Updated: {template.updatedAt.slice(0, 10)}</span>
        <span>ID: {template.id}</span>
      </div>

      {/* Upcoming Occurrences */}
      <div className="detail-section">
        <h3 className="section-title">Upcoming Occurrences (next 30 days)</h3>
        <UpcomingSection templateId={templateId} />
      </div>

      {/* Skip List */}
      <div className="detail-section">
        <h3 className="section-title">Skipped Dates</h3>
        <SkipList dates={template.skippedDates ?? []} />
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Template"
          message={`Delete "${template.title}"? This cannot be undone. Existing generated tasks will not be affected.`}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
