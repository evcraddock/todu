import type { HabitId, Task } from "@todu/core/browser";
import { type ReactNode, useState } from "react";
import {
  useActors,
  useCheckHabit,
  useHabitList,
  useHabitStreak,
  useProjects,
  useTasks,
  useUncheckHabit,
} from "../hooks/useTodu.js";
import { createActorMap, getActorNames } from "../lib/actors.js";
import {
  addDays,
  buildDashboardSections,
  formatDueLabel,
  isOverdue,
  todayStr,
} from "../lib/home-helpers.js";
import { AssigneeDetail } from "./AssigneeDetail.js";

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
  actorMap,
  onSelectAssignee,
}: {
  task: Task;
  projectName?: string;
  today: string;
  onSelect: (id: string) => void;
  actorMap: ReturnType<typeof createActorMap>;
  onSelectAssignee: (id: string) => void;
}): ReactNode {
  const names = getActorNames(task.assigneeActorIds ?? [], actorMap, task.assignees ?? []);
  const dueLabel = formatDueLabel(task, today);
  const overdue = isOverdue(task, today);

  return (
    <div
      role="button"
      tabIndex={0}
      className="home-task-row home-task-columns"
      onClick={() => onSelect(task.id)}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onSelect(task.id);
        }
      }}
    >
      <span className="home-task-title">{task.title}</span>
      <span className="home-task-project" title={projectName}>
        {projectName || "—"}
      </span>
      <span className="home-task-assignees">
        {names.length ? (
          names.map((name, index) => {
            const actorId = task.assigneeActorIds?.[index];
            return (
              <span key={actorId ?? `${name}-${index}`}>
                {index > 0 && ", "}
                {actorId ? (
                  <button
                    type="button"
                    className="assignee-name-link"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectAssignee(actorId);
                    }}
                  >
                    {name}
                  </button>
                ) : (
                  name
                )}
              </span>
            );
          })
        ) : (
          <span className="empty-hint">Unassigned</span>
        )}
      </span>
      <span>
        <span className={`chip priority-${task.priority}`}>{task.priority}</span>
      </span>
      <span className={`home-task-due ${overdue ? "cell-overdue" : ""}`}>{dueLabel || "—"}</span>
    </div>
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
  actorMap,
  onSelectAssignee,
}: {
  title: string;
  icon: string;
  tasks: Task[];
  projectMap: Map<string, string>;
  today: string;
  onSelectTask: (id: string) => void;
  emptyText?: string;
  actorMap: ReturnType<typeof createActorMap>;
  onSelectAssignee: (id: string) => void;
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
        <div className="home-task-columns home-task-column-headings" aria-hidden="true">
          <span>Task</span>
          <span>Project</span>
          <span>Assignee</span>
          <span>Priority</span>
          <span>Due</span>
        </div>
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            projectName={projectMap.get(task.projectId)}
            today={today}
            onSelect={onSelectTask}
            actorMap={actorMap}
            onSelectAssignee={onSelectAssignee}
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
  onNavigateToProject,
  onNavigateToHabit,
}: {
  onNavigateToTask: (taskId: string) => void;
  onNavigateToProject: (projectId: string) => void;
  onNavigateToHabit: (habitId: string) => void;
}): ReactNode {
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string | null>(null);
  const { data: actors } = useActors();
  const actorMap = createActorMap(actors);

  // Fetch all relevant task groups
  const { data: inprogressTasks } = useTasks({ status: "inprogress" });
  const { data: activeTasks } = useTasks({ status: "active" });
  const { data: waitingTasks } = useTasks({ status: "waiting" });
  const {
    data: projects,
    isLoading: projectsLoading,
    isError: projectsFailed,
    error: projectsError,
  } = useProjects();
  const { data: habits } = useHabitList({ paused: false });
  const focusProjects =
    projects?.filter((project) => project.status === "active" && project.priority === "high") ?? [];

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
    thisWeek,
    waiting,
  } = buildDashboardSections(
    inprogressTasks ?? [],
    activeTasks ?? [],
    waitingTasks ?? [],
    today,
    threeDaysOut,
  );

  const isLoading = !inprogressTasks && !activeTasks;

  if (selectedAssigneeId)
    return (
      <AssigneeDetail
        actorId={selectedAssigneeId}
        backLabel="Home"
        onBack={() => setSelectedAssigneeId(null)}
      />
    );

  return (
    <div className="home-view">
      <h2 className="view-title">Home</h2>

      {isLoading ? (
        <div className="loading-state">Loading…</div>
      ) : (
        <>
          {/* Today's Habits */}
          {habits && habits.length > 0 && (
            <div className="home-section">
              <h3 className="home-section-title">
                <span>🔥</span> Today&apos;s Habits
                <span className="home-section-count">{habits.length}</span>
              </h3>
              <div className="home-habit-grid">
                {habits.map((habit) => (
                  <div key={habit.id} className="home-habit-row">
                    <button
                      type="button"
                      className="home-task-title home-habit-title"
                      title={habit.title}
                      aria-label={habit.title}
                      onClick={() => onNavigateToHabit(habit.id)}
                    >
                      {Array.from(habit.title).length > 32
                        ? `${Array.from(habit.title).slice(0, 31).join("").trimEnd()}…`
                        : habit.title}
                    </button>
                    <HabitCheckIn habitId={habit.id} />
                  </div>
                ))}
              </div>
            </div>
          )}

          <Section
            title="In Progress"
            icon="▶"
            tasks={inProgressSection}
            projectMap={projectMap}
            today={today}
            onSelectTask={onNavigateToTask}
            actorMap={actorMap}
            onSelectAssignee={setSelectedAssigneeId}
            emptyText="Nothing in progress right now"
          />

          <Section
            title="Coming Soon"
            icon="📅"
            tasks={comingSoon}
            projectMap={projectMap}
            today={today}
            onSelectTask={onNavigateToTask}
            actorMap={actorMap}
            onSelectAssignee={setSelectedAssigneeId}
          />

          <Section
            title="This Week"
            icon="⚡"
            tasks={thisWeek}
            projectMap={projectMap}
            today={today}
            onSelectTask={onNavigateToTask}
            actorMap={actorMap}
            onSelectAssignee={setSelectedAssigneeId}
          />

          <Section
            title="Waiting"
            icon="⏳"
            tasks={waiting}
            projectMap={projectMap}
            today={today}
            onSelectTask={onNavigateToTask}
            actorMap={actorMap}
            onSelectAssignee={setSelectedAssigneeId}
          />

          {(projectsLoading || projectsFailed || focusProjects.length > 0) && (
            <div className="home-section">
              <h3 className="home-section-title">
                <span>◎</span> Project Focus
                {!projectsLoading && !projectsFailed && (
                  <span className="home-section-count">{focusProjects.length}</span>
                )}
              </h3>
              {projectsLoading ? (
                <div className="loading-state">Loading projects…</div>
              ) : projectsFailed ? (
                <div className="error-state" role="alert">
                  <p>Failed to load projects</p>
                  <p className="error-detail">
                    {projectsError instanceof Error ? projectsError.message : "Unknown error"}
                  </p>
                </div>
              ) : (
                <div className="home-project-grid">
                  {focusProjects.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      className="home-task-row home-project-card"
                      title={project.name}
                      onClick={() => onNavigateToProject(project.id)}
                    >
                      <span className="home-task-title">{project.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
