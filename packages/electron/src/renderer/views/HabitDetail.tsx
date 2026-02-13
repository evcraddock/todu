import type { HabitId } from "@todu/core/browser";
import { type ReactNode, useState } from "react";
import { CommentThread } from "../components/CommentThread.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { SchedulePresetPicker } from "../components/SchedulePresetPicker.js";
import {
  useCheckHabit,
  useDeleteHabit,
  useHabitDetail,
  useHabitHistory,
  useHabitStreak,
  usePauseHabit,
  useResumeHabit,
  useUncheckHabit,
  useUpdateHabit,
} from "../hooks/useTodu.js";
import { describeSchedule } from "../lib/describe-schedule.js";

// ============================================================================
// Streak Stats
// ============================================================================

function StreakStats({
  habitId,
}: {
  habitId: string;
}): ReactNode {
  const { data: streak, isLoading } = useHabitStreak(habitId);
  const checkHabit = useCheckHabit();
  const uncheckHabit = useUncheckHabit();

  if (isLoading) return <div className="loading-state">Loading streak…</div>;
  if (!streak) return <div className="empty-hint">No streak data</div>;

  const isPending = checkHabit.isPending || uncheckHabit.isPending;

  const handleToggle = () => {
    if (streak.completedToday) {
      uncheckHabit.mutate(habitId as HabitId);
    } else {
      checkHabit.mutate(habitId as HabitId);
    }
  };

  return (
    <div className="streak-stats">
      <div className="streak-stat">
        <span className="streak-stat-value">🔥 {streak.current}</span>
        <span className="streak-stat-label">Current Streak</span>
      </div>
      <div className="streak-stat">
        <span className="streak-stat-value">📊 {streak.longest}</span>
        <span className="streak-stat-label">Longest Streak</span>
      </div>
      <div className="streak-stat">
        <button
          type="button"
          className={`streak-checkin-btn ${streak.completedToday ? "checkin-done" : "checkin-pending"}`}
          onClick={handleToggle}
          disabled={isPending}
        >
          {streak.completedToday ? "✅ Done" : "☐ Check In"}
        </button>
        <span className="streak-stat-label">Today</span>
      </div>
      <div className="streak-stat">
        <span className="streak-stat-value">📈 {streak.totalCheckins}</span>
        <span className="streak-stat-label">Total Check-ins</span>
      </div>
    </div>
  );
}

// ============================================================================
// History Calendar (last 30 days)
// ============================================================================

function HistoryCalendar({ habitId }: { habitId: string }): ReactNode {
  const { data: history, isLoading } = useHabitHistory(habitId, 30);

  if (isLoading) return <div className="loading-state">Loading history…</div>;
  if (!history || history.length === 0) return <div className="empty-hint">No history yet</div>;

  // Build a set of completed dates and scheduled dates
  const completedDates = new Set<string>();
  const scheduledDates = new Set<string>();
  for (const entry of history) {
    scheduledDates.add(entry.date);
    if (entry.completed) completedDates.add(entry.date);
  }

  // Generate last 30 days grid
  const today = new Date();
  const days: { date: string; scheduled: boolean; completed: boolean }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    days.push({
      date: dateStr,
      scheduled: scheduledDates.has(dateStr),
      completed: completedDates.has(dateStr),
    });
  }

  return (
    <div className="history-grid">
      {days.map((day) => {
        let cls = "history-day";
        if (!day.scheduled) cls += " history-day-unscheduled";
        else if (day.completed) cls += " history-day-completed";
        else cls += " history-day-missed";

        return (
          <div
            key={day.date}
            className={cls}
            title={`${day.date}${day.scheduled ? (day.completed ? " ✅" : " missed") : " (not scheduled)"}`}
          >
            <span className="history-day-num">{Number.parseInt(day.date.slice(8), 10)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Habit Detail View
// ============================================================================

export function HabitDetail({
  habitId,
  onBack,
}: {
  habitId: string;
  onBack: () => void;
}): ReactNode {
  const { data: habit, isLoading, isError, error } = useHabitDetail(habitId);
  const updateHabit = useUpdateHabit();
  const deleteHabit = useDeleteHabit();
  const pauseHabit = usePauseHabit();
  const resumeHabit = useResumeHabit();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  if (isLoading) {
    return (
      <div className="view-container">
        <div className="loading-state">Loading habit…</div>
      </div>
    );
  }

  if (isError || !habit) {
    return (
      <div className="view-container">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onBack}>
          ← Back
        </button>
        <div className="error-state">
          <p>Failed to load habit</p>
          <p className="error-detail">
            {error instanceof Error ? error.message : "Habit not found"}
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
    if (editValue !== (habit as Record<string, unknown>)[field]) {
      updateHabit.mutate({
        id: habit.id as HabitId,
        input: { [field]: editValue },
      });
    }
  };

  const handleDelete = () => {
    deleteHabit.mutate(habit.id as HabitId, { onSuccess: onBack });
  };

  const handlePauseToggle = () => {
    if (habit.paused) {
      resumeHabit.mutate(habit.id as HabitId);
    } else {
      pauseHabit.mutate(habit.id as HabitId);
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
            className={`btn btn-sm ${habit.paused ? "btn-primary" : "btn-secondary"}`}
            onClick={handlePauseToggle}
          >
            {habit.paused ? "▶ Resume" : "⏸ Pause"}
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
            onClick={() => handleInlineEdit("title", habit.title)}
          >
            {habit.title}
            {habit.paused && <span className="chip status-paused detail-paused-badge">paused</span>}
          </button>
        )}
      </div>

      {/* Streak Stats */}
      <div className="detail-section">
        <StreakStats habitId={habitId} />
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
                if (editValue !== habit.schedule) {
                  updateHabit.mutate({
                    id: habit.id as HabitId,
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
            onClick={() => handleInlineEdit("schedule", habit.schedule)}
          >
            {describeSchedule(habit.schedule)}
          </button>
        )}
      </div>

      {/* Dates */}
      <div className="detail-field">
        <span className="detail-label">Start Date</span>
        <span>{habit.startDate}</span>
      </div>
      {habit.endDate && (
        <div className="detail-field">
          <span className="detail-label">End Date</span>
          <span>{habit.endDate}</span>
        </div>
      )}
      <div className="detail-field">
        <span className="detail-label">Next Due</span>
        <span>{habit.nextDue ?? "—"}</span>
      </div>
      <div className="detail-field">
        <span className="detail-label">Timezone</span>
        <span>{habit.timezone}</span>
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
            onClick={() => handleInlineEdit("description", habit.description ?? "")}
          >
            {habit.description || <span className="empty-hint">Click to add description…</span>}
          </button>
        )}
      </div>

      {/* History */}
      <div className="detail-section">
        <h3 className="section-title">Last 30 Days</h3>
        <HistoryCalendar habitId={habitId} />
      </div>

      {/* Metadata */}
      <div className="detail-meta">
        <span>Created: {habit.createdAt.slice(0, 10)}</span>
        <span>Updated: {habit.updatedAt.slice(0, 10)}</span>
        <span>ID: {habit.id}</span>
      </div>

      {/* Comments */}
      <CommentThread entityType="habit" entityId={habitId} />

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Habit"
          message={`Delete "${habit.title}"? All check-in history will be lost. This cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
