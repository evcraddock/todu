import type { ProjectId, RecurringId, RecurringMissPolicy } from "@todu/core/browser";
import { type ReactNode, useEffect, useState } from "react";
import { BackButton } from "../components/BackButton.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { EntityIdCopy } from "../components/EntityIdCopy.js";
import { EntityTimestamps } from "../components/EntityTimestamps.js";
import { Icon } from "../components/Icon.js";
import { LabelPicker } from "../components/LabelPicker.js";
import { MarkdownEditor } from "../components/MarkdownEditor.js";
import { ProjectOptions } from "../components/ProjectOptions.js";
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
    <>
      {generate.error && (
        <div className="error-state" role="alert">
          {generate.error.message}
        </div>
      )}
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
                    <span className="generated-tag">
                      <Icon name="check" /> Task created: {taskId.slice(0, 12)}…
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm btn-with-icon"
                      onClick={() => handleGenerate(occ.date)}
                      disabled={generate.isPending}
                    >
                      <Icon name="add" />
                      Generate
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
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
        <div className="loading-state">Loading recurring task…</div>
      </div>
    );
  }

  if (isError || !template) {
    return (
      <div className="view-container">
        <BackButton label="Recurring Tasks" onClick={onBack} />
        <div className="error-state">
          <p>Failed to load recurring task</p>
          <p className="error-detail">
            {error instanceof Error ? error.message : "Recurring task not found"}
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
    if (scheduleValue !== template.schedule) {
      updateRecurring.mutate(
        { id: template.id as RecurringId, input: { schedule: scheduleValue } },
        { onSuccess: () => setEditingSchedule(false) },
      );
    } else setEditingSchedule(false);
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
    <div className="view-container entity-detail-view recurring-detail-view">
      <div className="detail-page-header">
        {/* Toolbar */}
        <div className="detail-toolbar">
          <BackButton label="Recurring Tasks" onClick={onBack} />
          <div className="toolbar-actions">
            <button
              type="button"
              className="btn-icon"
              title="Delete"
              aria-label="Delete"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Icon name="delete" />
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
            </button>
          )}
        </div>
        {(updateRecurring.error || pauseRecurring.error || resumeRecurring.error) && (
          <div className="error-state" role="alert">
            {(updateRecurring.error || pauseRecurring.error || resumeRecurring.error)?.message}
          </div>
        )}
        <section className="detail-properties" aria-label="Recurring task details">
          <div className="detail-property-grid">
            <label className="list-filter-field">
              Status
              <select
                className="filter-select"
                value={template.paused ? "paused" : "active"}
                disabled={pauseRecurring.isPending || resumeRecurring.isPending}
                onChange={(e) => {
                  if ((e.target.value === "paused") !== template.paused) handlePauseToggle();
                }}
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
              </select>
            </label>
            <label className="list-filter-field">
              Priority
              <select
                className="filter-select"
                value={template.priority}
                disabled={updateRecurring.isPending}
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
            </label>
            <label className="list-filter-field">
              Project
              <select
                className="filter-select"
                value={template.projectId}
                disabled={updateRecurring.isPending}
                onChange={(e) =>
                  updateRecurring.mutate({
                    id: template.id as RecurringId,
                    input: { projectId: e.target.value as ProjectId },
                  })
                }
              >
                <ProjectOptions projects={projects} />
              </select>
            </label>
          </div>
          <div className="detail-schedule-row">
            <div className="list-filter-field">
              Schedule
              <span className="detail-property-value">{describeSchedule(template.schedule)}</span>
            </div>
            {!editingSchedule && (
              <button
                type="button"
                className="btn btn-sm task-label-edit"
                onClick={() => {
                  setScheduleValue(template.schedule);
                  setEditingSchedule(true);
                }}
              >
                <Icon name="edit" /> Edit schedule
              </button>
            )}
          </div>
          {editingSchedule && (
            <section className="detail-schedule-editor" aria-label="Edit recurring schedule">
              <SchedulePresetPicker value={scheduleValue} onChange={setScheduleValue} />
              <div className="detail-schedule-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm btn-with-icon"
                  disabled={!scheduleValue.trim() || updateRecurring.isPending}
                  onClick={handleScheduleSave}
                >
                  <Icon name="save" /> Save schedule
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm btn-with-icon"
                  disabled={updateRecurring.isPending}
                  onClick={() => setEditingSchedule(false)}
                >
                  <Icon name="cancel" /> Cancel
                </button>
              </div>
            </section>
          )}
          <div className="recurring-policy-field list-filter-field">
            <label htmlFor="recurring-miss-policy">Missed occurrences</label>
            <select
              id="recurring-miss-policy"
              aria-label="Miss Policy"
              aria-describedby="recurring-miss-policy-hint"
              className="filter-select"
              value={missPolicy}
              disabled={updateRecurring.isPending}
              onChange={(e) =>
                updateRecurring.mutate({
                  id: template.id as RecurringId,
                  input: { missPolicy: e.target.value as RecurringMissPolicy },
                })
              }
            >
              {RECURRING_MISS_POLICY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.value === "accumulate"
                    ? "Catch up on missed occurrences"
                    : "Keep only the latest due occurrence"}
                </option>
              ))}
            </select>
            <span className="detail-property-hint" id="recurring-miss-policy-hint">
              {getRecurringMissPolicyExplanation(missPolicy)}
            </span>
          </div>
          <div className="detail-date-info">
            <div className="list-filter-field">
              Start date<span className="detail-property-value">{template.startDate}</span>
            </div>
            {template.endDate && (
              <div className="list-filter-field">
                End date<span className="detail-property-value">{template.endDate}</span>
              </div>
            )}
            <div className="list-filter-field">
              Next due
              <span className="detail-property-value">{template.nextDue?.slice(0, 10) || "—"}</span>
            </div>
            <div className="list-filter-field">
              Timezone<span className="detail-property-value">{template.timezone}</span>
            </div>
          </div>
          <LabelPicker
            labels={template.labels}
            isPending={updateRecurring.isPending}
            onSave={(labels, onSuccess) =>
              updateRecurring.mutate(
                { id: template.id as RecurringId, input: { labels } },
                { onSuccess },
              )
            }
          />
        </section>
      </div>
      <div className="detail-page-content">
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
      </div>

      {/* Footer metadata */}
      <div className="detail-meta">
        <EntityTimestamps createdAt={template.createdAt} updatedAt={template.updatedAt} />
        <EntityIdCopy id={template.id} entityName="recurring task" />
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Recurring Task"
          message={`Delete "${template.title}"? This cannot be undone. Existing generated tasks will not be affected.`}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
