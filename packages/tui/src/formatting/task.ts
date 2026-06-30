import type { Project, Task, TaskWithDetail } from "@todu/core";
import { formatTaskPriority } from "./priority.js";
import { formatTaskStatus } from "./status.js";
import { truncateText } from "./truncate.js";

export function formatTaskRow(task: Task, projectName: string | null, maxTitleLength = 42): string {
  const parts = [
    `[${formatTaskPriority(task.priority)}]`,
    `[${formatTaskStatus(task.status)}]`,
    truncateText(task.title, maxTitleLength),
  ];

  if (projectName) {
    parts.push(`(${projectName})`);
  }

  if (task.labels.length > 0) {
    parts.push(task.labels.map((label) => `#${label}`).join(" "));
  }

  return parts.join(" ");
}

export function formatTaskDetailLines(
  task: TaskWithDetail | Task,
  projectName: string | null,
): string[] {
  const lines = [
    task.title,
    `Status: ${formatTaskStatus(task.status)}`,
    `Priority: ${formatTaskPriority(task.priority)}`,
    `Project: ${projectName ?? task.projectId}`,
  ];

  if (task.labels.length > 0) {
    lines.push(`Labels: ${task.labels.map((label) => `#${label}`).join(" ")}`);
  }

  if ("description" in task && task.description?.trim()) {
    lines.push("", "Description", task.description.trim());
  }

  return lines;
}

export function createProjectNameMap(
  projects: readonly Project[] | undefined,
): Map<string, string> {
  return new Map((projects ?? []).map((project) => [project.id, project.name]));
}
