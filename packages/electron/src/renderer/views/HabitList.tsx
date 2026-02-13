import type { HabitId } from "@todu/core/browser";
import { type ReactNode, useState } from "react";
import { useCheckHabit, useHabitList, useHabitStreak, useUncheckHabit } from "../hooks/useTodu.js";
import { describeSchedule } from "../lib/describe-schedule.js";

// ============================================================================
// Streak Cell — fetches streak per habit
// ============================================================================

function StreakCell({ habitId }: { habitId: string }): ReactNode {
  const { data: streak } = useHabitStreak(habitId);
  if (!streak) return <span className="empty-hint">—</span>;
  return <span className="streak-count">🔥 {streak.current}</span>;
}

// ============================================================================
// Check-In Toggle
// ============================================================================

function CheckInToggle({ habitId }: { habitId: string }): ReactNode {
  const { data: streak } = useHabitStreak(habitId);
  const checkHabit = useCheckHabit();
  const uncheckHabit = useUncheckHabit();

  const completed = streak?.completedToday ?? false;
  const isPending = checkHabit.isPending || uncheckHabit.isPending;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (completed) {
      uncheckHabit.mutate(habitId as HabitId);
    } else {
      checkHabit.mutate(habitId as HabitId);
    }
  };

  return (
    <button
      type="button"
      className={`checkin-toggle ${completed ? "checkin-done" : "checkin-pending"}`}
      onClick={handleToggle}
      disabled={isPending}
      title={completed ? "Uncheck today" : "Check in today"}
    >
      {completed ? "✅" : "—"}
    </button>
  );
}

// ============================================================================
// Habit List View
// ============================================================================

export function HabitList({
  onSelectHabit,
  onCreateHabit,
}: {
  onSelectHabit: (id: string) => void;
  onCreateHabit: () => void;
}): ReactNode {
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "paused">("all");

  const filter = {
    ...(filterStatus === "active" ? { paused: false } : {}),
    ...(filterStatus === "paused" ? { paused: true } : {}),
  };

  const { data: habits, isLoading, isError, error } = useHabitList(filter);

  if (isLoading) {
    return (
      <div className="view-container">
        <div className="view-header">
          <h2 className="view-title">Habits</h2>
        </div>
        <div className="loading-state">Loading habits…</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="view-container">
        <div className="view-header">
          <h2 className="view-title">Habits</h2>
        </div>
        <div className="error-state">
          <p>Failed to load habits</p>
          <p className="error-detail">{error instanceof Error ? error.message : "Unknown error"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="view-container">
      <div className="view-header">
        <h2 className="view-title">Habits</h2>
        <button type="button" className="btn btn-primary" onClick={onCreateHabit}>
          + New Habit
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
        </div>
      </div>

      {!habits || habits.length === 0 ? (
        <div className="empty-state">
          <p>No habits yet</p>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Schedule</th>
              <th>Streak</th>
              <th>Today</th>
              <th>Next Due</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {habits.map((habit) => (
              <tr
                key={habit.id}
                className="clickable-row"
                onClick={() => onSelectHabit(habit.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSelectHabit(habit.id);
                }}
              >
                <td className="cell-name">{habit.title}</td>
                <td className="cell-schedule">{describeSchedule(habit.schedule)}</td>
                <td>
                  <StreakCell habitId={habit.id} />
                </td>
                <td>
                  <CheckInToggle habitId={habit.id} />
                </td>
                <td className="cell-date">{habit.nextDue?.slice(0, 10) ?? "—"}</td>
                <td>
                  <span className={`chip ${habit.paused ? "status-paused" : "status-active"}`}>
                    {habit.paused ? "paused" : "active"}
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
