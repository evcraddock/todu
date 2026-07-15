import type { TaskFilter, TaskPriority, TaskStatus } from "@todu/core";
import type { ProjectFilterState } from "./project-filter.js";

export const openTaskStatuses = [
  "active",
  "inprogress",
  "waiting",
] as const satisfies readonly TaskStatus[];

export interface TuiTaskFilterState {
  projectFilter: ProjectFilterState;
  priority?: TaskPriority;
}

export function createOpenTaskFilter({ projectFilter, priority }: TuiTaskFilterState): TaskFilter {
  return {
    status: [...openTaskStatuses],
    ...(priority ? { priority } : {}),
    ...(projectFilter.projectId ? { projectId: projectFilter.projectId } : {}),
  };
}

export function formatTaskFilterSummary({ projectFilter, priority }: TuiTaskFilterState): string {
  return `Open · ${formatPriorityFilter(priority)} · ${projectFilter.projectName ?? "All Projects"}`;
}

function formatPriorityFilter(priority: TaskPriority | undefined): string {
  if (!priority) {
    return "Any priority";
  }

  return `${priority[0]?.toUpperCase()}${priority.slice(1)} priority`;
}
