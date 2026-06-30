import type { TaskPriority } from "@todu/core";

export function formatTaskPriority(priority: TaskPriority): string {
  if (priority === "medium") {
    return "med";
  }

  return priority;
}
