import type {
  HabitFilter,
  NoteFilter,
  ProjectFilter,
  TaskFilter,
  TaskId,
  TaskSortOptions,
} from "@todu/core";

export const queryKeys = {
  actors: () => ["actors"] as const,
  projects: (filter?: ProjectFilter) => ["projects", filter ?? null] as const,
  project: (id: string) => ["projects", id] as const,
  tasks: (filter?: TaskFilter, sort?: TaskSortOptions) =>
    ["tasks", filter ?? null, sort ?? null] as const,
  task: (id: TaskId | string) => ["tasks", id] as const,
  notes: (filter?: NoteFilter) => ["notes", filter ?? null] as const,
  taskComments: (taskId: TaskId | string) => ["tasks", taskId, "comments"] as const,
  habits: (filter?: HabitFilter) => ["habits", filter ?? null] as const,
  syncStatus: () => ["sync", "status"] as const,
};
