import type { Project, ProjectId, Task, TaskWithDetail } from "@todu/core";
import { createProjectId, createTaskId, isTaskPriority, isTaskStatus } from "@todu/core";
import type { Todu } from "@todu/engine";
import type { Command } from "commander";
import { formatError, formatJSON, formatTable } from "../format.js";

const TASK_COLUMNS = [
  { key: "id", label: "ID" },
  { key: "title", label: "Title" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "project", label: "Project" },
];

function taskToRow(t: Task, projectName?: string): Record<string, string> {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    project: projectName ?? t.projectId,
  };
}

function taskDetail(t: TaskWithDetail, projectName?: string): string {
  const lines = [
    `ID:          ${t.id}`,
    `Title:       ${t.title}`,
    `Status:      ${t.status}`,
    `Priority:    ${t.priority}`,
    `Project:     ${projectName ?? t.projectId}`,
    `Labels:      ${t.labels.length > 0 ? t.labels.join(", ") : "(none)"}`,
    `Created:     ${t.createdAt}`,
    `Updated:     ${t.updatedAt}`,
  ];
  if (t.dueDate) lines.push(`Due:         ${t.dueDate}`);
  if (t.scheduledDate) lines.push(`Scheduled:   ${t.scheduledDate}`);
  if (t.description) {
    lines.push("", "Description:", t.description);
  }
  return lines.join("\n");
}

/**
 * Resolve a project reference to a ProjectId.
 * Try as ID first, then search by name.
 */
async function resolveProjectId(
  todu: Todu,
  ref: string,
): Promise<{ ok: true; id: ProjectId; name: string } | { ok: false; message: string }> {
  // Try as ID
  const byId = await todu.project.get(createProjectId(ref));
  if (byId.ok) return { ok: true, id: byId.value.id, name: byId.value.name };

  // Try name search
  const list = await todu.project.list();
  if (!list.ok) return { ok: false, message: formatError(list.error) };

  const matches = list.value.filter((p) => p.name.toLowerCase() === ref.toLowerCase());
  if (matches.length === 1) return { ok: true, id: matches[0].id, name: matches[0].name };
  if (matches.length > 1) {
    return { ok: false, message: `Multiple projects match "${ref}". Use the project ID instead.` };
  }
  return { ok: false, message: `Project not found: ${ref}` };
}

/**
 * Build a map of projectId → projectName for display.
 */
async function buildProjectNameMap(todu: Todu): Promise<Record<string, string>> {
  const result = await todu.project.list();
  if (!result.ok) return {};
  const map: Record<string, string> = {};
  for (const p of result.value) {
    map[p.id] = p.name;
  }
  return map;
}

export function registerTaskCommands(program: Command, getTodu: () => Promise<Todu>): void {
  const task = program.command("task").description("Manage tasks");

  // create
  task
    .command("create")
    .description("Create a new task")
    .requiredOption("--title <title>", "task title")
    .requiredOption("--project <project>", "project (ID or name)")
    .option("--priority <priority>", "priority (low, medium, high)", "medium")
    .option("--description <desc>", "task description")
    .option("--label <labels...>", "labels")
    .option("--due <date>", "due date (ISO format)")
    .option("--scheduled <date>", "scheduled date (ISO format)")
    .action(async (opts) => {
      const todu = await getTodu();
      try {
        const project = await resolveProjectId(todu, opts.project);
        if (!project.ok) {
          console.error(project.message);
          process.exitCode = 1;
          return;
        }

        const result = await todu.task.create({
          title: opts.title,
          projectId: project.id,
          priority: opts.priority,
          description: opts.description,
          labels: opts.label,
          dueDate: opts.due,
          scheduledDate: opts.scheduled,
        });

        if (!result.ok) {
          console.error(formatError(result.error));
          process.exitCode = 1;
          return;
        }

        const format = program.opts().format;
        if (format === "json") {
          console.log(formatJSON(result.value));
        } else {
          console.log("Task created:");
          console.log(taskDetail(result.value, project.name));
        }
      } finally {
        await todu.close();
      }
    });

  // list
  task
    .command("list")
    .description("List tasks")
    .option("--project <project>", "filter by project (ID or name)")
    .option("--status <status>", "filter by status")
    .option("--priority <priority>", "filter by priority")
    .option("--label <label>", "filter by label")
    .action(async (opts) => {
      const todu = await getTodu();
      try {
        let projectId: ProjectId | undefined;
        if (opts.project) {
          const project = await resolveProjectId(todu, opts.project);
          if (!project.ok) {
            console.error(project.message);
            process.exitCode = 1;
            return;
          }
          projectId = project.id;
        }

        if (opts.status && !isTaskStatus(opts.status)) {
          console.error(`Error: invalid status: ${opts.status}`);
          process.exitCode = 1;
          return;
        }
        if (opts.priority && !isTaskPriority(opts.priority)) {
          console.error(`Error: invalid priority: ${opts.priority}`);
          process.exitCode = 1;
          return;
        }

        const result = await todu.task.list({
          projectId,
          status: opts.status,
          priority: opts.priority,
          label: opts.label,
        });

        if (!result.ok) {
          console.error(formatError(result.error));
          process.exitCode = 1;
          return;
        }

        const format = program.opts().format;
        if (format === "json") {
          console.log(formatJSON(result.value));
        } else {
          const nameMap = await buildProjectNameMap(todu);
          const rows = result.value.map((t) => taskToRow(t, nameMap[t.projectId]));
          console.log(formatTable(rows, TASK_COLUMNS));
        }
      } finally {
        await todu.close();
      }
    });

  // show
  task
    .command("show <id>")
    .description("Show task details")
    .action(async (id) => {
      const todu = await getTodu();
      try {
        const result = await todu.task.get(createTaskId(id));
        if (!result.ok) {
          console.error(formatError(result.error));
          process.exitCode = 1;
          return;
        }

        const nameMap = await buildProjectNameMap(todu);
        const format = program.opts().format;
        if (format === "json") {
          console.log(formatJSON(result.value));
        } else {
          console.log(taskDetail(result.value, nameMap[result.value.projectId]));
        }
      } finally {
        await todu.close();
      }
    });

  // update
  task
    .command("update <id>")
    .description("Update a task")
    .option("--title <title>", "new title")
    .option("--status <status>", "new status")
    .option("--priority <priority>", "new priority")
    .option("--description <desc>", "new description")
    .option("--label <labels...>", "replace labels")
    .option("--due <date>", "new due date")
    .option("--scheduled <date>", "new scheduled date")
    .action(async (id, opts) => {
      const todu = await getTodu();
      try {
        const result = await todu.task.update(createTaskId(id), {
          title: opts.title,
          status: opts.status,
          priority: opts.priority,
          description: opts.description,
          labels: opts.label,
          dueDate: opts.due,
          scheduledDate: opts.scheduled,
        });

        if (!result.ok) {
          console.error(formatError(result.error));
          process.exitCode = 1;
          return;
        }

        const nameMap = await buildProjectNameMap(todu);
        const format = program.opts().format;
        if (format === "json") {
          console.log(formatJSON(result.value));
        } else {
          console.log("Task updated:");
          console.log(taskDetail(result.value, nameMap[result.value.projectId]));
        }
      } finally {
        await todu.close();
      }
    });

  // delete
  task
    .command("delete <id>")
    .description("Delete a task")
    .action(async (id) => {
      const todu = await getTodu();
      try {
        const result = await todu.task.delete(createTaskId(id));
        if (!result.ok) {
          console.error(formatError(result.error));
          process.exitCode = 1;
          return;
        }

        const format = program.opts().format;
        if (format === "json") {
          console.log(formatJSON({ deleted: id }));
        } else {
          console.log(`Deleted task: ${id}`);
        }
      } finally {
        await todu.close();
      }
    });

  // move
  task
    .command("move <id> <project>")
    .description("Move a task to another project")
    .action(async (id, projectRef) => {
      const todu = await getTodu();
      try {
        const project = await resolveProjectId(todu, projectRef);
        if (!project.ok) {
          console.error(project.message);
          process.exitCode = 1;
          return;
        }

        const result = await todu.task.move(createTaskId(id), project.id);
        if (!result.ok) {
          console.error(formatError(result.error));
          process.exitCode = 1;
          return;
        }

        const format = program.opts().format;
        if (format === "json") {
          console.log(formatJSON(result.value));
        } else {
          console.log(`Moved task to ${project.name}:`);
          console.log(taskDetail(result.value, project.name));
        }
      } finally {
        await todu.close();
      }
    });

  // search
  task
    .command("search <query>")
    .description("Search tasks by title")
    .action(async (query) => {
      const todu = await getTodu();
      try {
        const result = await todu.task.search(query);
        if (!result.ok) {
          console.error(formatError(result.error));
          process.exitCode = 1;
          return;
        }

        const format = program.opts().format;
        if (format === "json") {
          console.log(formatJSON(result.value));
        } else {
          const nameMap = await buildProjectNameMap(todu);
          const rows = result.value.map((t) => taskToRow(t, nameMap[t.projectId]));
          console.log(formatTable(rows, TASK_COLUMNS));
        }
      } finally {
        await todu.close();
      }
    });
}
