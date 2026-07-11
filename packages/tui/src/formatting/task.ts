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

export function formatTaskMetadata(
  task: TaskWithDetail | Task,
  projectName: string | null,
): string {
  const metadata = [
    formatTaskStatus(task.status),
    formatTaskPriority(task.priority),
    projectName ?? task.projectId,
  ];

  if (task.labels.length > 0) {
    metadata.push(task.labels.map((label) => `#${label}`).join(" "));
  }

  return metadata.join(" • ");
}

export function createProjectNameMap(
  projects: readonly Project[] | undefined,
): Map<string, string> {
  return new Map((projects ?? []).map((project) => [project.id, project.name]));
}
