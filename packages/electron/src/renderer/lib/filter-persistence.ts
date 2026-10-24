import type { TaskFilter } from "@todu/core/browser";

const STORAGE_KEY = "todu:task-filter";

/** Renderer-only project and assignee scopes for task lists. */
export interface TaskListFilter extends TaskFilter {
  activeProjects?: boolean;
  assignee?: string;
}

/** Default filter: unfinished tasks, including waiting work. */
export const DEFAULT_FILTER: TaskFilter = {
  status: ["active", "inprogress", "waiting"],
};

/** Save task filter to localStorage. */
export function saveFilter(filter: TaskListFilter): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filter));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

/** Load task filter from localStorage, falling back to defaults. */
export function loadFilter(): TaskListFilter {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_FILTER, activeProjects: true };
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      return { activeProjects: !parsed.projectId, ...parsed } as TaskListFilter;
    }
  } catch {
    // Corrupted data — fall back to defaults
  }
  return { ...DEFAULT_FILTER, activeProjects: true };
}
