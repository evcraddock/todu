import type { Project, Task } from "@todu/core";

export interface HomeTaskSections {
  now: readonly Task[];
  thisWeek: readonly Task[];
  waiting: readonly Task[];
}

export function createHomeProjectFocus(projects: readonly Project[]): Project[] {
  return projects.filter((project) => project.status === "active" && project.priority === "high");
}

export function localDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addCalendarDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return localDateString(new Date(year, month - 1, day + days, 12));
}

export function endOfWeek(today: string): string {
  const [year, month, day] = today.split("-").map(Number);
  const weekday = new Date(year, month - 1, day, 12).getDay();
  return addCalendarDays(today, 6 - weekday);
}

export function createHomeTaskSections(
  tasks: readonly Task[],
  today = localDateString(),
): HomeTaskSections {
  const weekEnd = endOfWeek(today);
  const now: Task[] = [];
  const thisWeek: Task[] = [];
  const waiting: Task[] = [];

  for (const task of tasks) {
    const dueDate = task.dueDate?.slice(0, 10);
    if (task.status === "inprogress" || (task.status === "active" && dueDate === today)) {
      now.push(task);
      continue;
    }

    const scheduledDate = task.scheduledDate?.slice(0, 10);
    if (task.status === "active" && scheduledDate && scheduledDate <= weekEnd) {
      thisWeek.push(task);
      continue;
    }

    if (task.status === "waiting") {
      waiting.push(task);
    }
  }

  return { now, thisWeek, waiting };
}
