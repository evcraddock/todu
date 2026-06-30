import type { TaskStatus } from "@todu/core";

export type TaskStatusAction = "start" | "wait" | "done" | "cancel";

export interface TaskStatusActionConfig {
  action: TaskStatusAction;
  status: TaskStatus;
  successLabel: string;
  requiresConfirmation: boolean;
}

export const taskStatusActions: Record<TaskStatusAction, TaskStatusActionConfig> = {
  start: {
    action: "start",
    status: "inprogress",
    successLabel: "started",
    requiresConfirmation: false,
  },
  wait: {
    action: "wait",
    status: "waiting",
    successLabel: "marked waiting",
    requiresConfirmation: false,
  },
  done: {
    action: "done",
    status: "done",
    successLabel: "completed",
    requiresConfirmation: false,
  },
  cancel: {
    action: "cancel",
    status: "canceled",
    successLabel: "cancelled",
    requiresConfirmation: true,
  },
};

export function resolveTaskStatusAction(input: string): TaskStatusActionConfig | null {
  if (input === "s") {
    return taskStatusActions.start;
  }

  if (input === "w") {
    return taskStatusActions.wait;
  }

  if (input === "d") {
    return taskStatusActions.done;
  }

  if (input === "x") {
    return taskStatusActions.cancel;
  }

  return null;
}
