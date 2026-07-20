import type { Task } from "@todu/core";

export interface HomeTaskSections {
  now: readonly Task[];
  next: readonly Task[];
  waiting: readonly Task[];
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

export function createHomeTaskSections(
  tasks: readonly Task[],
  today = localDateString(),
): HomeTaskSections {
  const twoDaysOut = addCalendarDays(today, 2);
  const now: Task[] = [];
  const next: Task[] = [];
  const waiting: Task[] = [];

  for (const task of tasks) {
    const dueDate = task.dueDate?.slice(0, 10);
    if (task.status === "inprogress" || (task.status === "active" && dueDate === today)) {
      now.push(task);
      continue;
    }

    if (task.status === "active" && (task.priority === "high" || dueDate === twoDaysOut)) {
      next.push(task);
      continue;
    }

    if (task.status === "waiting") {
      waiting.push(task);
    }
  }

  return { now, next, waiting };
}
