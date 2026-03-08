import type { ProjectId, RecurringId, RecurringMissPolicy } from "@todu/core/browser";
import { type ReactNode, useEffect, useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { MarkdownEditor } from "../components/MarkdownEditor.js";
import { PriorityChip } from "../components/PriorityChip.js";
import { SchedulePresetPicker } from "../components/SchedulePresetPicker.js";
import { TabBar } from "../components/TabBar.js";
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
import {
  getRecurringMissPolicy,
  getRecurringMissPolicyExplanation,
  RECURRING_MISS_POLICY_OPTIONS,
} from "../lib/recurring-miss-policy.js";

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
// Content tabs
// ============================================================================

const TABS = [
  { id: "description", label: "Description" },
  { id: "upcoming", label: "Upcoming" },
];

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

  // Focus entity context for agent
  useEffect(() => {
    window.todu.agent.focusEntity("recurring", templateId);
    return () => {
      window.todu.agent.clearFocusedEntity();
    };
  }, [templateId]);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [scheduleValue, setScheduleValue] = useState("");
  const [editingDescription, setEditingDescription] = useState(false);
  const [activeTab, setActiveTab] = useState("description");

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

  const missPolicy = getRecurringMissPolicy(template);

  const handleTitleSave = () => {
    setEditingTitle(false);
    if (titleValue.trim() && titleValue !== template.title) {
      updateRecurring.mutate({
        id: template.id as RecurringId,
        input: { title: titleValue.trim() },
      });
    }
  };

  const handleScheduleSave = () => {
    setEditingSchedule(false);
    if (scheduleValue !== template.schedule) {
      updateRecurring.mutate({
        id: template.id as RecurringId,
        input: { schedule: scheduleValue },
      });
    }
  };

  const handleDescriptionSave = (markdown: string) => {
    if (markdown !== (template.description ?? "")) {
      updateRecurring.mutate({
        id: template.id as RecurringId,
        input: { description: markdown },
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
      {/* Toolbar */}
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
        {editingTitle ? (
          <input
            className="input detail-title-input"
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={handleTitleSave}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleTitleSave();
              if (e.key === "Escape") setEditingTitle(false);
            }}
            autoFocus
          />
        ) : (
          <button
            type="button"
            className="detail-title clickable"
            onClick={() => {
              setTitleValue(template.title);
              setEditingTitle(true);
            }}
          >
            {template.title}
            {template.paused && (
              <span className="chip status-paused detail-paused-badge">paused</span>
            )}
          </button>
        )}
      </div>

      {/* Compressed metadata — Row 1: Schedule, Priority, Project */}
      <div className="detail-meta-row">
        <div className="detail-meta-cell">
          <span className="detail-meta-label">Schedule</span>
          {editingSchedule ? (
            <div className="inline-schedule-edit">
              <SchedulePresetPicker value={scheduleValue} onChange={setScheduleValue} />
              <button type="button" className="btn btn-primary btn-sm" onClick={handleScheduleSave}>
                Save
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setEditingSchedule(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="clickable-value"
              onClick={() => {
                setScheduleValue(template.schedule);
                setEditingSchedule(true);
              }}
            >
              {describeSchedule(template.schedule)}
            </button>
          )}
        </div>
        <div className="detail-meta-cell">
          <PriorityChip priority={template.priority} />
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
        <div className="detail-meta-cell">
          <span className="detail-meta-label">Project</span>
          <select
            className="filter-select inline-select"
            value={template.projectId}
            onChange={(e) =>
              updateRecurring.mutate({
                id: template.id as RecurringId,
                input: { projectId: e.target.value as ProjectId },
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
        <div className="detail-meta-cell">
          <span className="detail-meta-label">Miss Policy</span>
          <select
            aria-label="Miss Policy"
            className="filter-select inline-select"
            value={missPolicy}
            onChange={(e) =>
              updateRecurring.mutate({
                id: template.id as RecurringId,
                input: { missPolicy: e.target.value as RecurringMissPolicy },
              })
            }
          >
            {RECURRING_MISS_POLICY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="detail-meta-label">{getRecurringMissPolicyExplanation(missPolicy)}</span>
        </div>
      </div>

      {/* Compressed metadata — Row 2: Dates, Labels */}
      <div className="detail-meta-row">
        <div className="detail-meta-cell">
          <span className="detail-meta-label">Start</span>
          <span>{template.startDate}</span>
        </div>
        {template.endDate && (
          <div className="detail-meta-cell">
            <span className="detail-meta-label">End</span>
            <span>{template.endDate}</span>
          </div>
        )}
        <div className="detail-meta-cell">
          <span className="detail-meta-label">Next Due</span>
          <span>{template.nextDue ?? "—"}</span>
        </div>
        <div className="detail-meta-cell">
          <span className="detail-meta-label">Timezone</span>
          <span>{template.timezone}</span>
        </div>
        <div className="detail-meta-cell">
          <span className="detail-meta-label">Labels</span>
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
      </div>

      {/* Tabbed content */}
      <div className="detail-tabs">
        <TabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

        {activeTab === "description" && (
          <div className="detail-tab-content">
            {editingDescription ? (
              <MarkdownEditor
                value={template.description ?? ""}
                onChange={handleDescriptionSave}
                placeholder="Add a description…"
                minHeight={200}
                autoFocus
                onBlur={() => setEditingDescription(false)}
              />
            ) : (
              <button
                type="button"
                className="detail-description clickable"
                onClick={() => setEditingDescription(true)}
              >
                {template.description ? (
                  <MarkdownEditor value={template.description} editable={false} minHeight={60} />
                ) : (
                  <span className="empty-hint">Click to add description…</span>
                )}
              </button>
            )}
          </div>
        )}

        {activeTab === "upcoming" && (
          <div className="detail-tab-content">
            <h3 className="section-title">Upcoming Occurrences (next 30 days)</h3>
            <UpcomingSection templateId={templateId} />

            <div className="detail-section">
              <h3 className="section-title">Skipped Dates</h3>
              <SkipList dates={template.skippedDates ?? []} />
            </div>
          </div>
        )}
      </div>

      {/* Footer metadata */}
      <div className="detail-meta">
        <span>Created: {template.createdAt.slice(0, 10)}</span>
        <span>Updated: {template.updatedAt.slice(0, 10)}</span>
        <span>ID: {template.id}</span>
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
