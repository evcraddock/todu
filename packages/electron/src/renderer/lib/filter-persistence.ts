import type { TaskFilter } from "@todu/core/browser";

const STORAGE_KEY = "todu:task-filter";

/** Default filter: active and inprogress statuses toggled on. */
export const DEFAULT_FILTER: TaskFilter = {
  status: ["active", "inprogress"],
};

/** Save task filter to localStorage. */
export function saveFilter(filter: TaskFilter): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filter));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

/** Load task filter from localStorage, falling back to defaults. */
export function loadFilter(): TaskFilter {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_FILTER };
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as TaskFilter;
    }
  } catch {
    // Corrupted data — fall back to defaults
  }
  return { ...DEFAULT_FILTER };
}
