import type { Task, TaskSortOptions, TaskStatus, TaskWithDetail } from "@todu/core";
import { isTaskPriority, isTaskSortField, isTaskStatus } from "@todu/core";
import type { Command } from "commander";
import {
  buildActorMap,
  formatActorList,
  formatApprovalSummary,
  resolveActorDisplayInfo,
} from "../actor-display.js";
import { type CliDaemonInvoker, formatDaemonCommandError } from "../daemon-command-client.js";
import { colorPriority, colorStatus, formatJSON, formatTable } from "../format.js";

const TASK_COLUMNS = [
  { key: "id", label: "ID" },
  { key: "title", label: "Title" },
  { key: "status", label: "Status", colorize: colorStatus },
  { key: "priority", label: "Priority", colorize: colorPriority },
  { key: "project", label: "Project" },
  { key: "assignees", label: "Assignees" },
];

type ProjectSummary = {
  id: string;
  name: string;
  authorizedAssigneeActorIds: string[];
};

type ProjectSummaryMap = Record<string, ProjectSummary>;

type TaskOutput<T extends Task | TaskWithDetail> = T & {
  assigneeActors: Array<{
    id: string;
    displayName: string;
    archived: boolean;
    authorized: boolean;
    known: boolean;
  }>;
};

function taskToRow(
  task: Task,
  actorMap: Awaited<ReturnType<typeof buildActorMap>>,
  project?: ProjectSummary,
): Record<string, string> {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    project: project?.name ?? task.projectId,
    assignees: formatActorList(task.assigneeActorIds, actorMap, task.assignees, {
      authorizedActorIds: project?.authorizedAssigneeActorIds,
    }),
  };
}

function taskDetail(
  task: TaskWithDetail,
  actorMap: Awaited<ReturnType<typeof buildActorMap>>,
  project?: ProjectSummary,
): string {
  const lines = [
    `ID:          ${task.id}`,
    `Title:       ${task.title}`,
    `Status:      ${task.status}`,
    `Priority:    ${task.priority}`,
    `Project:     ${project?.name ?? task.projectId}`,
    `Assignees:   ${formatActorList(task.assigneeActorIds, actorMap, task.assignees, {
      includeIds: true,
      authorizedActorIds: project?.authorizedAssigneeActorIds,
    })}`,
    `Labels:      ${task.labels.length > 0 ? task.labels.join(", ") : "(none)"}`,
    `Created:     ${task.createdAt}`,
    `Updated:     ${task.updatedAt}`,
  ];
  if (task.dueDate) lines.push(`Due:         ${task.dueDate}`);
  if (task.scheduledDate) lines.push(`Scheduled:   ${task.scheduledDate}`);
  const approvalSummary = formatApprovalSummary(task.descriptionApproval);
  if (approvalSummary) lines.push(`Approval:    ${approvalSummary}`);
  if (task.description) {
    lines.push("", "Description:", task.description);
  }
  return lines.join("\n");
}

function enrichTaskForOutput<T extends Task | TaskWithDetail>(
  task: T,
  actorMap: Awaited<ReturnType<typeof buildActorMap>>,
  project?: ProjectSummary,
): TaskOutput<T> {
  return {
    ...task,
    assigneeActors: task.assigneeActorIds.map((actorId) =>
      resolveActorDisplayInfo(actorId, actorMap, {
        authorizedActorIds: project?.authorizedAssigneeActorIds,
      }),
    ),
  };
}

async function printTask<T extends Task | TaskWithDetail>(
  program: Command,
  invokeDaemon: CliDaemonInvoker,
  task: T,
  heading?: string,
): Promise<void> {
  const [projectMap, actorMap] = await Promise.all([
    buildProjectMap(invokeDaemon),
    buildActorMap(invokeDaemon),
  ]);
  const project = projectMap[task.projectId];
  const format = program.opts().format;

  if (format === "json") {
    console.log(formatJSON(enrichTaskForOutput(task, actorMap, project)));
    return;
  }

  if (heading) {
    console.log(heading);
  }
  console.log(taskDetail(task as TaskWithDetail, actorMap, project));
}

async function printTaskList(
  program: Command,
  invokeDaemon: CliDaemonInvoker,
  tasks: Task[],
): Promise<void> {
  const [projectMap, actorMap] = await Promise.all([
    buildProjectMap(invokeDaemon),
    buildActorMap(invokeDaemon),
  ]);
  const format = program.opts().format;

  if (format === "json") {
    console.log(
      formatJSON(
        tasks.map((task) => enrichTaskForOutput(task, actorMap, projectMap[task.projectId])),
      ),
    );
    return;
  }

  const rows = tasks.map((task) => taskToRow(task, actorMap, projectMap[task.projectId]));
  console.log(formatTable(rows, TASK_COLUMNS));
}

/**
 * Resolve a project reference to a project ID.
 * Try as ID first, then search by name.
 */
async function resolveProjectId(
  invokeDaemon: CliDaemonInvoker,
  ref: string,
): Promise<{ ok: true; id: string; name: string } | { ok: false; message: string }> {
  const byId = await invokeDaemon<{ id: string; name: string }>("project.get", { id: ref });
  if (byId.ok) {
    return { ok: true, id: byId.value.id, name: byId.value.name };
  }

  if (byId.error.code !== "NOT_FOUND") {
    return { ok: false, message: formatDaemonCommandError(byId.error) };
  }

  const list = await invokeDaemon<Array<{ id: string; name: string }>>("project.list", {});
  if (!list.ok) {
    return { ok: false, message: formatDaemonCommandError(list.error) };
  }

  const matches = list.value.filter((project) => project.name.toLowerCase() === ref.toLowerCase());
  if (matches.length === 1) {
    return { ok: true, id: matches[0].id, name: matches[0].name };
  }

  if (matches.length > 1) {
    return { ok: false, message: `Multiple projects match "${ref}". Use the project ID instead.` };
  }

  return { ok: false, message: `Project not found: ${ref}` };
}

async function buildProjectMap(invokeDaemon: CliDaemonInvoker): Promise<ProjectSummaryMap> {
  const result = await invokeDaemon<ProjectSummary[]>("project.list", {});
  if (!result.ok) {
    return {};
  }

  return Object.fromEntries(result.value.map((project) => [project.id, project]));
}

export function registerTaskCommands(program: Command, invokeDaemon: CliDaemonInvoker): void {
  const task = program.command("task").description("Manage tasks");

  task
    .command("create")
    .description("Create a new task")
    .requiredOption("--title <title>", "task title")
    .requiredOption("--project <project>", "project (ID or name)")
    .option("--priority <priority>", "priority (low, medium, high)", "medium")
    .option("--description <desc>", "task description")
    .option("--label <labels...>", "labels")
    .option("--assignee-actor <actorIds...>", "assign actor IDs")
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
          assigneeActorIds: opts.assigneeActor,
          dueDate: opts.due,
          scheduledDate: opts.scheduled,
        },
      });

      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }

      await printTask(program, invokeDaemon, result.value, "Task created:");
    });

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

      let status: TaskStatus | TaskStatus[] | undefined;
      if (opts.status) {
        const parts = opts.status.split(",").map((value: string) => value.trim());
        for (const value of parts) {
          if (!isTaskStatus(value)) {
            console.error(`Error: invalid status: ${value}`);
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

      await printTaskList(program, invokeDaemon, result.value);
    });

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

      await printTask(program, invokeDaemon, result.value);
    });

  task
    .command("update <id>")
    .description("Update a task")
    .option("--title <title>", "new title")
    .option("--status <status>", "new status")
    .option("--priority <priority>", "new priority")
    .option("--description <desc>", "new description")
    .option("--label <labels...>", "replace labels")
    .option("--assignee-actor <actorIds...>", "replace assignee actors by actor ID")
    .option("--clear-assignees", "clear all actor-based assignees")
    .option("--due <date>", "new due date")
    .option("--scheduled <date>", "new scheduled date")
    .action(async (id, opts) => {
      if (opts.assigneeActor && opts.clearAssignees) {
        console.error("Error: --assignee-actor and --clear-assignees cannot be used together");
        process.exitCode = 1;
        return;
      }

      const result = await invokeDaemon<TaskWithDetail>("task.update", {
        id,
        input: {
          title: opts.title,
          status: opts.status,
          priority: opts.priority,
          description: opts.description,
          labels: opts.label,
          assigneeActorIds: opts.clearAssignees ? [] : opts.assigneeActor,
          dueDate: opts.due,
          scheduledDate: opts.scheduled,
        },
      });

      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }

      await printTask(program, invokeDaemon, result.value, "Task updated:");
    });

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

      await printTask(program, invokeDaemon, result.value, `Moved task to ${project.name}:`);
    });

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

      await printTaskList(program, invokeDaemon, result.value);
    });

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

        await printTask(program, invokeDaemon, result.value, `Task ${targetStatus}:`);
      });
  }

  statusShortcut("start", "Start a task (set status to inprogress)", "inprogress");
  statusShortcut("done", "Complete a task (set status to done)", "done");
  statusShortcut("cancel", "Cancel a task (set status to canceled)", "canceled");
}
