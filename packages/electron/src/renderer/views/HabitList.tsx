import type { HabitFilter, HabitId } from "@todu/core/browser";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  useCheckHabit,
  useHabitList,
  useHabitStreak,
  useProjects,
  useUncheckHabit,
} from "../hooks/useTodu.js";
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
      {completed ? "✓ Done" : "Check in"}
    </button>
  );
}

// ============================================================================
// Habit List View
// ============================================================================

export function HabitList({
  onSelectHabit,
  onCreateHabit,
  externalFilter,
}: {
  onSelectHabit: (id: string) => void;
  onCreateHabit: () => void;
  externalFilter?: HabitFilter | null;
}): ReactNode {
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "paused">("all");
  const [filterProject, setFilterProject] = useState("active-projects");
  const [filterChecked, setFilterChecked] = useState<"all" | "done" | "pending">("all");
  const [searchText, setSearchText] = useState("");
  const [sort, setSort] = useState("name");
  const appliedExternalRef = useRef<HabitFilter | null | undefined>(undefined);

  // Apply external filter when it changes (e.g., from agent ui-action)
  useEffect(() => {
    if (externalFilter && externalFilter !== appliedExternalRef.current) {
      appliedExternalRef.current = externalFilter;
      if (externalFilter.paused === true) setFilterStatus("paused");
      else if (externalFilter.paused === false) setFilterStatus("active");
      else setFilterStatus("all");
      setFilterProject((externalFilter.projectId as string) ?? "");
      if (externalFilter.checkedToday === true) setFilterChecked("done");
      else if (externalFilter.checkedToday === false) setFilterChecked("pending");
      else setFilterChecked("all");
      setSearchText(externalFilter.search ?? "");
    }
  }, [externalFilter]);

  const filter: HabitFilter = {
    ...(filterStatus === "active" ? { paused: false } : {}),
    ...(filterStatus === "paused" ? { paused: true } : {}),
    ...(filterProject && filterProject !== "active-projects"
      ? { projectId: filterProject as HabitFilter["projectId"] }
      : {}),
    ...(filterChecked === "done" ? { checkedToday: true } : {}),
    ...(filterChecked === "pending" ? { checkedToday: false } : {}),
    ...(searchText ? { search: searchText } : {}),
  };

  const { data: habits, isLoading, isError, error } = useHabitList(filter);
  const { data: projects, isError: projectsError, error: projectError } = useProjects();
  const activeProjectsOnly = filterProject === "active-projects";
  const activeProjectIds = new Set(
    projects?.filter((project) => project.status === "active").map((project) => project.id),
  );
  const projectMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const project of projects ?? []) {
      map.set(project.id, project.name);
    }
    return map;
  }, [projects]);

  const displayHabits = [...(habits ?? [])]
    .filter((item) => !activeProjectsOnly || activeProjectIds.has(item.projectId))
    .sort((a, b) => {
      if (sort === "nextDue")
        return (
          (a.nextDue || "9999").localeCompare(b.nextDue || "9999") || a.title.localeCompare(b.title)
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
          <h2 className="view-title">Habits</h2>
        </div>
        <div className="error-state">
          <p>Failed to load habits</p>
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
          Habits <span className="list-count">{displayHabits.length}</span>
        </h2>
        <button type="button" className="btn btn-primary" onClick={onCreateHabit}>
          + New Habit
        </button>
      </div>

      <div className="filter-bar list-filters">
        <input
          type="search"
          className="search-input"
          aria-label="Search habits"
          placeholder="Search habits…"
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
              {projects?.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
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
          <label className="list-filter-field">
            Check-in
            <select
              className="filter-select"
              value={filterChecked}
              onChange={(e) => setFilterChecked(e.target.value as "all" | "done" | "pending")}
            >
              <option value="all">All check-ins</option>
              <option value="done">Done today</option>
              <option value="pending">Not done today</option>
            </select>
          </label>
          <button
            type="button"
            className="btn btn-secondary btn-sm list-clear-filters"
            onClick={() => {
              setFilterStatus("all");
              setFilterProject("");
              setFilterChecked("all");
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
          <option value="name">Habit: A–Z</option>
          <option value="nextDue">Next due: earliest first</option>
          <option value="status">Status: active first</option>
        </select>
      </label>

      {isLoading || (activeProjectsOnly && !projects) ? (
        <div className="loading-state">Loading habits…</div>
      ) : displayHabits.length === 0 ? (
        <div className="empty-state">
          <p>No habits match your filters</p>
        </div>
      ) : (
        <table className="data-table habit-table">
          <thead>
            <tr>
              <th>Habit</th>
              <th>Status</th>
              <th>Streak</th>
              <th>Today</th>
              <th>Next due</th>
            </tr>
          </thead>
          <tbody>
            {displayHabits.map((habit) => (
              <tr
                key={habit.id}
                className="clickable-row"
                tabIndex={0}
                onClick={() => onSelectHabit(habit.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.target === e.currentTarget) onSelectHabit(habit.id);
                }}
              >
                <td className="cell-name">
                  <span className="habit-row-title">{habit.title}</span>
                  <span className="habit-row-context">
                    {(!filterProject || activeProjectsOnly) && (
                      <>
                        {projectMap.get(habit.projectId) ??
                          (habit.projectId ? "Project unavailable" : "No project assigned")}{" "}
                        ·{" "}
                      </>
                    )}
                    {describeSchedule(habit.schedule)}
                  </span>
                </td>
                <td>
                  <span className={`chip ${habit.paused ? "status-paused" : "status-active"}`}>
                    {habit.paused ? "Paused" : "Active"}
                  </span>
                </td>
                <td>
                  <StreakCell habitId={habit.id} />
                </td>
                <td>
                  <CheckInToggle habitId={habit.id} />
                </td>
                <td className="cell-date">{habit.nextDue?.slice(0, 10) ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
