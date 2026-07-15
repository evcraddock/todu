import type {
  ProjectFilter,
  ProjectStatus,
  TaskFilter,
  TaskPriority,
  TaskStatus,
} from "@todu/core";
import type { ProjectFilterState } from "./project-filter.js";

export interface TaskListFilterState {
  statuses: readonly TaskStatus[];
  priority?: TaskPriority;
  includeHigherPriorities?: boolean;
}

export interface ProjectListFilterState {
  statuses: readonly ProjectStatus[];
  priority?: TaskPriority;
  includeHigherPriorities?: boolean;
}

export const defaultTaskListFilter: TaskListFilterState = {
  statuses: ["active", "inprogress", "waiting"],
};

export const defaultProjectListFilter: ProjectListFilterState = {
  statuses: ["active", "done", "canceled"],
};

export function createTaskListQuery(
  projectFilter: ProjectFilterState,
  listFilter: TaskListFilterState,
): TaskFilter {
  return {
    status: [...listFilter.statuses],
    ...(listFilter.priority && !listFilter.includeHigherPriorities
      ? { priority: listFilter.priority }
      : {}),
    ...(projectFilter.projectId ? { projectId: projectFilter.projectId } : {}),
  };
}

export function createProjectListQuery(listFilter: ProjectListFilterState): ProjectFilter {
  return {
    status: [...listFilter.statuses],
    ...(listFilter.priority && !listFilter.includeHigherPriorities
      ? { priority: listFilter.priority }
      : {}),
  };
}

export function toggleStatus<Status extends string>(
  statuses: readonly Status[],
  status: Status,
): readonly Status[] {
  if (statuses.includes(status)) {
    return statuses.length > 1 ? statuses.filter((value) => value !== status) : statuses;
  }

  return [...statuses, status];
}

export function formatTaskStatusFilter(statuses: readonly TaskStatus[]): string {
  if (sameStatuses(statuses, defaultTaskListFilter.statuses)) {
    return "Open";
  }

  return formatStatusFilter(statuses, {
    active: "Active",
    inprogress: "In Progress",
    waiting: "Waiting",
    done: "Done",
    canceled: "Canceled",
  });
}

export function formatProjectListFilter(filter: ProjectListFilterState): string {
  return `${formatProjectStatusFilter(filter.statuses)} · ${formatPriorityFilter(
    filter.priority,
    filter.includeHigherPriorities,
  )}`;
}

export function matchesPriority(
  priority: TaskPriority,
  filter: Pick<TaskListFilterState, "priority" | "includeHigherPriorities">,
): boolean {
  if (!filter.priority) {
    return true;
  }

  if (!filter.includeHigherPriorities) {
    return priority === filter.priority;
  }

  return priorityRank[priority] >= priorityRank[filter.priority];
}

export function formatProjectStatusFilter(statuses: readonly ProjectStatus[]): string {
  if (sameStatuses(statuses, defaultProjectListFilter.statuses)) {
    return "All statuses";
  }

  return formatStatusFilter(statuses, {
    active: "Active",
    done: "Done",
    canceled: "Canceled",
  });
}

export function formatPriorityFilter(
  priority: TaskPriority | undefined,
  includeHigherPriorities = false,
): string {
  if (!priority) {
    return "Any priority";
  }

  const label = `${priority[0]?.toUpperCase()}${priority.slice(1)} priority`;
  return includeHigherPriorities ? `${label} and higher` : label;
}

const priorityRank: Record<TaskPriority, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

function sameStatuses<Status extends string>(
  left: readonly Status[],
  right: readonly Status[],
): boolean {
  return left.length === right.length && left.every((status) => right.includes(status));
}

function formatStatusFilter<Status extends string>(
  statuses: readonly Status[],
  labels: Record<Status, string>,
): string {
  if (statuses.length === 1) {
    return labels[statuses[0] as Status];
  }

  return statuses.length <= 3
    ? statuses.map((status) => labels[status]).join(" + ")
    : `${statuses.length} statuses`;
}
