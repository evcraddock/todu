import type { ProjectFilter, TaskFilter, TaskSortOptions } from "@todu/core/browser";
import { isTaskSortField } from "@todu/core/browser";

const STORAGE_KEY = "todu:task-filter";
const SORT_STORAGE_KEY = "todu:task-sort";

/** Restore only the Projects page's filter dropdowns. */
export function loadProjectFilter(): ProjectFilter {
  try {
    const raw = localStorage.getItem("todu:list:projects:filter");
    if (!raw) return { status: "active" };
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return { status: "active" };
    const statuses = Array.isArray(saved.status) ? saved.status : [saved.status];
    const validStatuses = ["active", "done", "canceled"];
    if (
      saved.status !== undefined &&
      !statuses.every((status: unknown) => validStatuses.includes(status as string))
    )
      return { status: "active" };
    if (saved.priority !== undefined && !["high", "medium", "low"].includes(saved.priority))
      return { status: "active" };
    return { status: saved.status, priority: saved.priority };
  } catch {
    return { status: "active" };
  }
}

/** Keep project filters separate from task filters and temporary search text. */
export function saveProjectFilter(filter: ProjectFilter): void {
  try {
    localStorage.setItem(
      "todu:list:projects:filter",
      JSON.stringify({ status: filter.status, priority: filter.priority }),
    );
  } catch {
    // Keep the filter usable when storage is unavailable.
  }
}

/** Save the selected task order, including the default ordering. */
export function saveTaskSort(sort: TaskSortOptions | undefined): void {
  try {
    if (sort) localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(sort));
    else localStorage.removeItem(SORT_STORAGE_KEY);
  } catch {
    // Keep the current selection usable when storage is unavailable.
  }
}

/** Restore supported sort selections, falling back to the default ordering. */
export function loadTaskSort(): TaskSortOptions | undefined {
  try {
    const raw = localStorage.getItem(SORT_STORAGE_KEY);
    if (!raw) return undefined;
    const sort = JSON.parse(raw);
    if (
      sort &&
      typeof sort.field === "string" &&
      isTaskSortField(sort.field) &&
      (sort.direction === "asc" || sort.direction === "desc")
    )
      return { field: sort.field, direction: sort.direction };
  } catch {
    // Ignore unavailable or invalid saved preferences.
  }
  return undefined;
}

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
