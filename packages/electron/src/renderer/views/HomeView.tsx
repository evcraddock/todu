import type { HabitId, Task } from "@todu/core/browser";
import type { ReactNode } from "react";
import {
  useCheckHabit,
  useHabitList,
  useHabitStreak,
  useProjects,
  useTasks,
  useUncheckHabit,
} from "../hooks/useTodu.js";
import {
  addDays,
  buildDashboardSections,
  formatDueLabel,
  isOverdue,
  todayStr,
} from "../lib/home-helpers.js";

// ============================================================================
// Habit check-in for dashboard
// ============================================================================

function HabitCheckIn({ habitId }: { habitId: string }): ReactNode {
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
    <span className="home-habit-row-right">
      {streak ? <span className="streak-count">🔥 {streak.current}</span> : null}
      <button
        type="button"
        className={`checkin-toggle ${completed ? "checkin-done" : "checkin-pending"}`}
        onClick={handleToggle}
        disabled={isPending}
        title={completed ? "Uncheck today" : "Check in today"}
      >
        {completed ? "✅" : "⬜"}
      </button>
    </span>
  );
}

// ============================================================================
// Task row
// ============================================================================

function TaskRow({
  task,
  projectName,
  today,
  onSelect,
}: {
  task: Task;
  projectName?: string;
  today: string;
  onSelect: (id: string) => void;
}): ReactNode {
  const dueLabel = formatDueLabel(task, today);
  const overdue = isOverdue(task, today);

  return (
    <button type="button" className="home-task-row" onClick={() => onSelect(task.id)}>
      <span className="home-task-title">{task.title}</span>
      <span className="home-task-meta">
        {projectName && <span className="home-task-project">{projectName}</span>}
        <span className={`chip priority-${task.priority}`}>{task.priority}</span>
        {dueLabel && (
          <span className={`home-task-due ${overdue ? "cell-overdue" : ""}`}>{dueLabel}</span>
        )}
      </span>
    </button>
  );
}

// ============================================================================
// Section
// ============================================================================

function Section({
  title,
  icon,
  tasks,
  projectMap,
  today,
  onSelectTask,
  emptyText,
}: {
  title: string;
  icon: string;
  tasks: Task[];
  projectMap: Map<string, string>;
  today: string;
  onSelectTask: (id: string) => void;
  emptyText?: string;
}): ReactNode {
  if (tasks.length === 0 && emptyText) {
    return (
      <div className="home-section">
        <h3 className="home-section-title">
          <span>{icon}</span> {title}
        </h3>
        <p className="home-section-empty">{emptyText}</p>
      </div>
    );
  }

  if (tasks.length === 0) return null;

  return (
    <div className="home-section">
      <h3 className="home-section-title">
        <span>{icon}</span> {title}
        <span className="home-section-count">{tasks.length}</span>
      </h3>
      <div className="home-task-list">
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            projectName={projectMap.get(task.projectId)}
            today={today}
            onSelect={onSelectTask}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// HomeView
// ============================================================================

export function HomeView({
  onNavigateToTask,
}: {
  onNavigateToTask: (taskId: string) => void;
}): ReactNode {
  // Fetch all relevant task groups
  const { data: inprogressTasks } = useTasks({ status: "inprogress" });
  const { data: activeTasks } = useTasks({ status: "active" });
  const { data: waitingTasks } = useTasks({ status: "waiting" });
  const { data: projects } = useProjects();
  const { data: habits } = useHabitList({ paused: false });

  const projectMap = new Map<string, string>();
  if (projects) {
    for (const p of projects) {
      projectMap.set(p.id, p.name);
    }
  }

  const today = todayStr();
  const threeDaysOut = addDays(today, 3);

  const {
    inProgress: inProgressSection,
    comingSoon,
    next,
    waiting,
  } = buildDashboardSections(
    inprogressTasks ?? [],
    activeTasks ?? [],
    waitingTasks ?? [],
    today,
    threeDaysOut,
  );

  const isLoading = !inprogressTasks && !activeTasks;

  return (
    <div className="home-view">
      <h2 className="view-title">Home</h2>

      {isLoading ? (
        <div className="loading-state">Loading…</div>
      ) : (
        <>
          <Section
            title="In Progress"
            icon="▶"
            tasks={inProgressSection}
            projectMap={projectMap}
            today={today}
            onSelectTask={onNavigateToTask}
            emptyText="Nothing in progress right now"
          />

          <Section
            title="Coming Soon"
            icon="📅"
            tasks={comingSoon}
            projectMap={projectMap}
            today={today}
            onSelectTask={onNavigateToTask}
          />

          <Section
            title="Next"
            icon="⚡"
            tasks={next}
            projectMap={projectMap}
            today={today}
            onSelectTask={onNavigateToTask}
          />

          <Section
            title="Waiting"
            icon="⏳"
            tasks={waiting}
            projectMap={projectMap}
            today={today}
            onSelectTask={onNavigateToTask}
          />

          {/* Today's Habits */}
          {habits && habits.length > 0 && (
            <div className="home-section">
              <h3 className="home-section-title">
                <span>🔥</span> Today&apos;s Habits
                <span className="home-section-count">{habits.length}</span>
              </h3>
              <div className="home-task-list">
                {habits.map((habit) => (
                  <div key={habit.id} className="home-habit-row">
                    <span className="home-task-title">{habit.title}</span>
                    <HabitCheckIn habitId={habit.id} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
