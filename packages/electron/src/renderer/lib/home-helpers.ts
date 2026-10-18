import type { Task } from "@todu/core/browser";

export function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d + days);
  const ry = date.getFullYear();
  const rm = String(date.getMonth() + 1).padStart(2, "0");
  const rd = String(date.getDate()).padStart(2, "0");
  return `${ry}-${rm}-${rd}`;
}

export function isOverdue(task: Task, today: string): boolean {
  if (!task.dueDate) return false;
  return task.dueDate.slice(0, 10) < today;
}

export function isDueToday(task: Task, today: string): boolean {
  if (!task.dueDate) return false;
  return task.dueDate.slice(0, 10) === today;
}

export function endOfWeek(today: string): string {
  const [year, month, day] = today.split("-").map(Number);
  const weekday = new Date(year, month - 1, day).getDay();
  return addDays(today, 6 - weekday);
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
  thisWeek: Task[];
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

  const thisWeek: Task[] = [];
  const weekEnd = endOfWeek(today);
  for (const t of activeTasks) {
    if (inProgressIds.has(t.id) || comingSoonIds.has(t.id)) continue;
    const scheduled = t.scheduledDate?.slice(0, 10);
    if (t.status === "active" && scheduled && scheduled <= weekEnd) {
      thisWeek.push(t);
    }
  }

  return { inProgress, comingSoon, thisWeek, waiting: waitingTasks };
}
