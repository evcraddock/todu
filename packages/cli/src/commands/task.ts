import type { Task, TaskSortOptions, TaskStatus, TaskWithDetail } from "@todu/core";
import { isTaskPriority, isTaskSortField, isTaskStatus } from "@todu/core";
import type { Command } from "commander";
import { type CliDaemonInvoker, formatDaemonCommandError } from "../daemon-command-client.js";
import { colorPriority, colorStatus, formatJSON, formatTable } from "../format.js";

const TASK_COLUMNS = [
  { key: "id", label: "ID" },
  { key: "title", label: "Title" },
  { key: "status", label: "Status", colorize: colorStatus },
  { key: "priority", label: "Priority", colorize: colorPriority },
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
 * Resolve a project reference to a project ID.
 * Try as ID first, then search by name.
 */
async function resolveProjectId(
  invokeDaemon: CliDaemonInvoker,
  ref: string,
): Promise<{ ok: true; id: string; name: string } | { ok: false; message: string }> {
  // Try as ID
  const byId = await invokeDaemon<{ id: string; name: string }>("project.get", { id: ref });
  if (byId.ok) {
    return { ok: true, id: byId.value.id, name: byId.value.name };
  }

  if (byId.error.code !== "NOT_FOUND") {
    return { ok: false, message: formatDaemonCommandError(byId.error) };
  }

  // Try name search
  const list = await invokeDaemon<Array<{ id: string; name: string }>>("project.list", {});
  if (!list.ok) {
    return { ok: false, message: formatDaemonCommandError(list.error) };
  }

  const matches = list.value.filter((p) => p.name.toLowerCase() === ref.toLowerCase());
  if (matches.length === 1) {
    return { ok: true, id: matches[0].id, name: matches[0].name };
  }

  if (matches.length > 1) {
    return { ok: false, message: `Multiple projects match "${ref}". Use the project ID instead.` };
  }

  return { ok: false, message: `Project not found: ${ref}` };
}

/**
 * Build a map of projectId → projectName for display.
 */
async function buildProjectNameMap(
  invokeDaemon: CliDaemonInvoker,
): Promise<Record<string, string>> {
  const result = await invokeDaemon<Array<{ id: string; name: string }>>("project.list", {});
  if (!result.ok) {
    return {};
  }

  const map: Record<string, string> = {};
  for (const p of result.value) {
    map[p.id] = p.name;
  }
  return map;
}

export function registerTaskCommands(program: Command, invokeDaemon: CliDaemonInvoker): void {
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
      const project = await resolveProjectId(invokeDaemon, opts.project);
      if (!project.ok) {
        console.error(project.message);
        process.exitCode = 1;
        return;
      }

      const result = await invokeDaemon<TaskWithDetail>("task.create", {
        input: {
          title: opts.title,
          projectId: project.id,
          priority: opts.priority,
          description: opts.description,
          labels: opts.label,
          dueDate: opts.due,
          scheduledDate: opts.scheduled,
        },
      });

      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
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
    });

  // list
  task
    .command("list")
    .description("List tasks")
    .option("--project <project>", "filter by project (ID or name)")
    .option("--status <statuses>", "filter by status (comma-separated)")
    .option("--priority <priority>", "filter by priority")
    .option("--label <label>", "filter by label")
    .option("--from <date>", "filter by created-at start (YYYY-MM-DD or ISO-8601)")
    .option("--to <date>", "filter by created-at end (YYYY-MM-DD or ISO-8601)")
    .option("--updated-from <date>", "filter by updated-at start (YYYY-MM-DD or ISO-8601)")
    .option("--updated-to <date>", "filter by updated-at end (YYYY-MM-DD or ISO-8601)")
    .option("--overdue", "show overdue tasks only")
    .option("--today", "show tasks due or scheduled today")
    .option("--sort <field>", "sort by field (priority, dueDate, createdAt, updatedAt, title)")
    .option("--asc", "sort ascending (default: descending)")
    .action(async (opts) => {
      let projectId: string | undefined;
      if (opts.project) {
        const project = await resolveProjectId(invokeDaemon, opts.project);
        if (!project.ok) {
          console.error(project.message);
          process.exitCode = 1;
          return;
        }
        projectId = project.id;
      }

      // Parse multi-status: --status active,inprogress
      let status: TaskStatus | TaskStatus[] | undefined;
      if (opts.status) {
        const parts = opts.status.split(",").map((s: string) => s.trim());
        for (const s of parts) {
          if (!isTaskStatus(s)) {
            console.error(`Error: invalid status: ${s}`);
            process.exitCode = 1;
            return;
          }
        }
        status = parts.length === 1 ? (parts[0] as TaskStatus) : (parts as TaskStatus[]);
      }

      if (opts.priority && !isTaskPriority(opts.priority)) {
        console.error(`Error: invalid priority: ${opts.priority}`);
        process.exitCode = 1;
        return;
      }

      // Parse sort
      let sort: TaskSortOptions | undefined;
      if (opts.sort) {
        if (!isTaskSortField(opts.sort)) {
          console.error(`Error: invalid sort field: ${opts.sort}`);
          process.exitCode = 1;
          return;
        }
        sort = { field: opts.sort, direction: opts.asc ? "asc" : "desc" };
      }

      const result = await invokeDaemon<Task[]>("task.list", {
        filter: {
          projectId,
          status,
          priority: opts.priority,
          label: opts.label,
          createdFrom: opts.from,
          createdTo: opts.to,
          updatedFrom: opts.updatedFrom,
          updatedTo: opts.updatedTo,
          overdue: opts.overdue,
          today: opts.today,
        },
        sort,
      });

      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }

      const format = program.opts().format;
      if (format === "json") {
        console.log(formatJSON(result.value));
      } else {
        const nameMap = await buildProjectNameMap(invokeDaemon);
        const rows = result.value.map((t) => taskToRow(t, nameMap[t.projectId]));
        console.log(formatTable(rows, TASK_COLUMNS));
      }
    });

  // show
  task
    .command("show <id>")
    .description("Show task details")
    .action(async (id) => {
      const result = await invokeDaemon<TaskWithDetail>("task.get", { id });
      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }

      const nameMap = await buildProjectNameMap(invokeDaemon);
      const format = program.opts().format;
      if (format === "json") {
        console.log(formatJSON(result.value));
      } else {
        console.log(taskDetail(result.value, nameMap[result.value.projectId]));
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
      const result = await invokeDaemon<TaskWithDetail>("task.update", {
        id,
        input: {
          title: opts.title,
          status: opts.status,
          priority: opts.priority,
          description: opts.description,
          labels: opts.label,
          dueDate: opts.due,
          scheduledDate: opts.scheduled,
        },
      });

      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }

      const nameMap = await buildProjectNameMap(invokeDaemon);
      const format = program.opts().format;
      if (format === "json") {
        console.log(formatJSON(result.value));
      } else {
        console.log("Task updated:");
        console.log(taskDetail(result.value, nameMap[result.value.projectId]));
      }
    });

  // delete
  task
    .command("delete <id>")
    .description("Delete a task")
    .action(async (id) => {
      const result = await invokeDaemon<null>("task.delete", { id });
      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }

      const format = program.opts().format;
      if (format === "json") {
        console.log(formatJSON({ deleted: id }));
      } else {
        console.log(`Deleted task: ${id}`);
      }
    });

  // move
  task
    .command("move <id> <project>")
    .description("Move a task to another project")
    .action(async (id, projectRef) => {
      const project = await resolveProjectId(invokeDaemon, projectRef);
      if (!project.ok) {
        console.error(project.message);
        process.exitCode = 1;
        return;
      }

      const result = await invokeDaemon<TaskWithDetail>("task.move", {
        id,
        projectId: project.id,
      });
      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
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
    });

  // search
  task
    .command("search <query>")
    .description("Search tasks by title")
    .action(async (query) => {
      const result = await invokeDaemon<Task[]>("task.search", { query });
      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }

      const format = program.opts().format;
      if (format === "json") {
        console.log(formatJSON(result.value));
      } else {
        const nameMap = await buildProjectNameMap(invokeDaemon);
        const rows = result.value.map((t) => taskToRow(t, nameMap[t.projectId]));
        console.log(formatTable(rows, TASK_COLUMNS));
      }
    });

  // Status shortcut helper
  function statusShortcut(name: string, description: string, targetStatus: TaskStatus) {
    task
      .command(`${name} <id>`)
      .description(description)
      .action(async (id) => {
        const result = await invokeDaemon<TaskWithDetail>("task.update", {
          id,
          input: { status: targetStatus },
        });
        if (!result.ok) {
          console.error(formatDaemonCommandError(result.error));
          process.exitCode = 1;
          return;
        }

        const nameMap = await buildProjectNameMap(invokeDaemon);
        const format = program.opts().format;
        if (format === "json") {
          console.log(formatJSON(result.value));
        } else {
          console.log(`Task ${targetStatus}:`);
          console.log(taskDetail(result.value, nameMap[result.value.projectId]));
        }
      });
  }

  statusShortcut("start", "Start a task (set status to inprogress)", "inprogress");
  statusShortcut("done", "Complete a task (set status to done)", "done");
  statusShortcut("cancel", "Cancel a task (set status to canceled)", "canceled");
}
