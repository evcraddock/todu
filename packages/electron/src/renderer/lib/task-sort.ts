import type { Task, TaskPriority, TaskStatus } from "@todu/core/browser";

// ============================================================================
// Default multi-field sort for task list
//
// Order: due date asc (nulls last) → status order → priority desc
// ============================================================================

const STATUS_ORDER: Record<TaskStatus, number> = {
  inprogress: 0,
  waiting: 1,
  active: 2,
  done: 3,
  canceled: 4,
};

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/**
 * Extract a comparable date string from a task.
 * Prefers dueDate, falls back to scheduledDate. Returns null if neither exists.
 */
function getEffectiveDate(task: Task): string | null {
  const due = task.dueDate?.slice(0, 10) ?? null;
  const scheduled = task.scheduledDate?.slice(0, 10) ?? null;
  return due ?? scheduled;
}

/**
 * Default comparator for task list: due date asc (nulls last),
 * then status order (inprogress → waiting → active → done → canceled),
 * then priority desc (high → medium → low).
 */
export function defaultTaskComparator(a: Task, b: Task): number {
  // 1. Due date ascending (nulls last)
  const dateA = getEffectiveDate(a);
  const dateB = getEffectiveDate(b);
  if (dateA !== dateB) {
    if (dateA === null) return 1;
    if (dateB === null) return -1;
    if (dateA < dateB) return -1;
    if (dateA > dateB) return 1;
  }

  // 2. Status order
  const statusA = STATUS_ORDER[a.status] ?? 99;
  const statusB = STATUS_ORDER[b.status] ?? 99;
  if (statusA !== statusB) return statusA - statusB;

  // 3. Priority descending (high first)
  const priA = PRIORITY_ORDER[a.priority] ?? 99;
  const priB = PRIORITY_ORDER[b.priority] ?? 99;
  if (priA !== priB) return priA - priB;

  return 0;
}
