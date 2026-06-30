import type { TaskStatus } from "@todu/core";

export function formatTaskStatus(status: TaskStatus): string {
  if (status === "inprogress") {
    return "doing";
  }

  return status;
}
