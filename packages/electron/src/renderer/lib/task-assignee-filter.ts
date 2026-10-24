import type { Task } from "@todu/core/browser";

/** Match stable assignee IDs; legacy names still count as assigned. */
export function matchesTaskAssignee(
  task: Pick<Task, "assigneeActorIds" | "assignees">,
  assignee?: string,
): boolean {
  if (!assignee) return true;
  if (assignee === "unassigned") return !task.assigneeActorIds?.length && !task.assignees?.length;
  return task.assigneeActorIds?.some((id) => id === assignee) ?? false;
}
