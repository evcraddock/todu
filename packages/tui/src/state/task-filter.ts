import type { TaskFilter, TaskPriority, TaskStatus } from "@todu/core";
import {
  createTaskListQuery,
  defaultTaskListFilter,
  formatPriorityFilter,
  formatTaskStatusFilter,
} from "./list-filter.js";
import type { ProjectFilterState } from "./project-filter.js";

export const openTaskStatuses = defaultTaskListFilter.statuses;

export interface TuiTaskFilterState {
  projectFilter: ProjectFilterState;
  statuses?: readonly TaskStatus[];
  priority?: TaskPriority;
  includeHigherPriorities?: boolean;
}

export function createTaskFilter({
  projectFilter,
  statuses,
  priority,
  includeHigherPriorities,
}: TuiTaskFilterState): TaskFilter {
  return createTaskListQuery(projectFilter, {
    statuses: statuses ?? defaultTaskListFilter.statuses,
    priority,
    includeHigherPriorities,
  });
}

export function createOpenTaskFilter({
  projectFilter,
  priority,
}: Omit<TuiTaskFilterState, "statuses">): TaskFilter {
  return createTaskFilter({ projectFilter, priority });
}

export function formatTaskFilterSummary({
  projectFilter,
  statuses = defaultTaskListFilter.statuses,
  priority,
  includeHigherPriorities,
}: TuiTaskFilterState): string {
  return `${formatTaskStatusFilter(statuses)} · ${formatPriorityFilter(
    priority,
    includeHigherPriorities,
  )} · ${projectFilter.projectName ?? "All Projects"}`;
}
