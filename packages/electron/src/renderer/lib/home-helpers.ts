import type { Task } from "@todu/core/browser";

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isOverdue(task: Task, today: string): boolean {
  if (!task.dueDate) return false;
  return task.dueDate.slice(0, 10) < today;
}

export function isDueToday(task: Task, today: string): boolean {
  if (!task.dueDate) return false;
  return task.dueDate.slice(0, 10) === today;
}

export function formatDueLabel(task: Task, today: string): string | null {
  if (!task.dueDate) return null;
  const due = task.dueDate.slice(0, 10);
  if (due < today) return "overdue";
  if (due === today) return "today";
  const tomorrow = addDays(today, 1);
  if (due === tomorrow) return "tomorrow";
  return due;
}

/** Build the four dashboard sections from task lists, deduplicating across sections. */
export function buildDashboardSections(
  inprogressTasks: Task[],
  activeTasks: Task[],
  waitingTasks: Task[],
  today: string,
  threeDaysOut: string,
): {
  inProgress: Task[];
  comingSoon: Task[];
  next: Task[];
  waiting: Task[];
} {
  const inProgress: Task[] = [];
  const inProgressIds = new Set<string>();

  for (const t of inprogressTasks) {
    inProgress.push(t);
    inProgressIds.add(t.id);
  }

  for (const t of activeTasks) {
    if (!inProgressIds.has(t.id) && (isDueToday(t, today) || isOverdue(t, today))) {
      inProgress.push(t);
      inProgressIds.add(t.id);
    }
  }

  const comingSoon: Task[] = [];
  const comingSoonIds = new Set<string>();
  for (const t of activeTasks) {
    if (inProgressIds.has(t.id)) continue;
    const due = t.dueDate?.slice(0, 10);
    if (due && due > today && due <= threeDaysOut) {
      comingSoon.push(t);
      comingSoonIds.add(t.id);
    }
  }

  const next: Task[] = [];
  for (const t of activeTasks) {
    if (inProgressIds.has(t.id) || comingSoonIds.has(t.id)) continue;
    if (t.priority === "high") {
      next.push(t);
    }
  }

  return { inProgress, comingSoon, next, waiting: waitingTasks };
}
