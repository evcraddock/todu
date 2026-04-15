import type { Project, ProjectStatus, Task } from "@todu/core";
import { isProjectStatus } from "@todu/core";
import type { Command } from "commander";
import {
  type ActorDisplayInfo,
  buildActorMap,
  formatActorList,
  resolveActorDisplayInfo,
} from "../actor-display.js";
import { type CliDaemonInvoker, formatDaemonCommandError } from "../daemon-command-client.js";
import { colorPriority, colorStatus, formatJSON, formatTable } from "../format.js";

const PROJECT_COLUMNS = [
  { key: "id", label: "ID" },
  { key: "name", label: "Name" },
  { key: "status", label: "Status", colorize: colorStatus },
  { key: "priority", label: "Priority", colorize: colorPriority },
];

interface ProjectDisplay extends Project {
  authorizedActors: ActorDisplayInfo[];
  staleUnauthorizedAssignees: Array<{
    taskId: Task["id"];
    title: string;
    assignees: ActorDisplayInfo[];
  }>;
}

function projectToRow(project: Project): Record<string, string> {
  return {
    id: project.id,
    name: project.name,
    status: project.status,
    priority: project.priority,
  };
}

async function buildProjectDisplay(
  invokeDaemon: CliDaemonInvoker,
  project: Project,
): Promise<ProjectDisplay> {
  const [actorMapResult, tasksResult] = await Promise.all([
    buildActorMap(invokeDaemon),
    invokeDaemon<Task[]>("task.list", {
      filter: {
        projectId: project.id,
      },
    }),
  ]);

  const authorizedActorIds = project.authorizedAssigneeActorIds ?? [];
  const authorizedActors = authorizedActorIds.map((actorId) =>
    resolveActorDisplayInfo(actorId, actorMapResult),
  );

  const staleUnauthorizedAssignees = tasksResult.ok
    ? tasksResult.value.flatMap((task) => {
        const assignees = task.assigneeActorIds
          .filter((actorId) => !authorizedActorIds.includes(actorId))
          .map((actorId) =>
            resolveActorDisplayInfo(actorId, actorMapResult, {
              authorizedActorIds: authorizedActorIds,
            }),
          );

        return assignees.length > 0
          ? [
              {
                taskId: task.id,
                title: task.title,
                assignees,
              },
            ]
          : [];
      })
    : [];

  return {
    ...project,
    authorizedActors,
    staleUnauthorizedAssignees,
  };
}

function formatActorDisplayInfoList(
  actors: readonly ActorDisplayInfo[],
  options: { includeIds?: boolean; authorizedActorIds?: readonly string[] } = {},
): string {
  const actorMap = actors.reduce<
    Record<string, { id: string; displayName: string; archived?: boolean }>
  >((map, actor) => {
    map[actor.id] = {
      id: actor.id,
      displayName: actor.displayName,
      ...(actor.archived ? { archived: true } : {}),
    };
    return map;
  }, {});

  return formatActorList(
    actors.map((actor) => actor.id),
    actorMap as Parameters<typeof formatActorList>[1],
    [],
    options,
  );
}

function projectDetail(project: ProjectDisplay): string {
  const lines = [
    `ID:          ${project.id}`,
    `Name:        ${project.name}`,
    `Status:      ${project.status}`,
    `Priority:    ${project.priority}`,
    `Authorized:  ${formatActorDisplayInfoList(project.authorizedActors, { includeIds: true })}`,
    `Created:     ${project.createdAt}`,
    `Updated:     ${project.updatedAt}`,
  ];
  if (project.description) {
    lines.push(`Description: ${project.description}`);
  }
  if (project.staleUnauthorizedAssignees.length > 0) {
    lines.push("", "Unauthorized task assignees:");
    for (const stale of project.staleUnauthorizedAssignees) {
      lines.push(
        `- ${stale.title} (${stale.taskId}): ${formatActorDisplayInfoList(stale.assignees, {
          includeIds: true,
          authorizedActorIds: project.authorizedAssigneeActorIds ?? [],
        })}`,
      );
    }
  }
  return lines.join("\n");
}

async function printProject(
  program: Command,
  invokeDaemon: CliDaemonInvoker,
  project: Project,
  heading?: string,
): Promise<void> {
  const display = await buildProjectDisplay(invokeDaemon, project);
  const format = program.opts().format;

  if (format === "json") {
    console.log(formatJSON(display));
    return;
  }

  if (heading) {
    console.log(heading);
  }
  console.log(projectDetail(display));
}

/**
 * Resolve a project reference — try as ID first, then search by name.
 */
async function resolveProject(
  invokeDaemon: CliDaemonInvoker,
  ref: string,
): Promise<{ ok: true; value: Project } | { ok: false; message: string }> {
  const byId = await invokeDaemon<Project>("project.get", { id: ref });
  if (byId.ok) {
    return byId;
  }

  if (byId.error.code !== "NOT_FOUND") {
    return { ok: false, message: formatDaemonCommandError(byId.error) };
  }

  const list = await invokeDaemon<Project[]>("project.list", {});
  if (!list.ok) {
    return { ok: false, message: formatDaemonCommandError(list.error) };
  }

  const matches = list.value.filter((project) => project.name.toLowerCase() === ref.toLowerCase());
  if (matches.length === 1) {
    return { ok: true, value: matches[0] };
  }

  if (matches.length > 1) {
    return { ok: false, message: `Multiple projects match "${ref}". Use the project ID instead.` };
  }

  return { ok: false, message: `Project not found: ${ref}` };
}

export function registerProjectCommands(program: Command, invokeDaemon: CliDaemonInvoker): void {
  const project = program.command("project").description("Manage projects");

  project
    .command("create")
    .description("Create a new project")
    .requiredOption("--name <name>", "project name")
    .option("--description <desc>", "project description")
    .option("--priority <priority>", "priority (low, medium, high)", "medium")
    .action(async (opts) => {
      const result = await invokeDaemon<Project>("project.create", {
        input: {
          name: opts.name,
          description: opts.description,
          priority: opts.priority,
        },
      });

      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }

      await printProject(program, invokeDaemon, result.value, "Project created:");
    });

  project
    .command("list")
    .description("List projects")
    .option("--status <status>", "filter by status (active, done, canceled)")
    .action(async (opts) => {
      const result = await invokeDaemon<Project[]>("project.list", {});

      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }

      let projects = result.value;
      if (opts.status) {
        if (!isProjectStatus(opts.status)) {
          console.error(`Error: invalid status: ${opts.status}`);
          process.exitCode = 1;
          return;
        }
        projects = projects.filter(
          (candidate) => candidate.status === (opts.status as ProjectStatus),
        );
      }

      const format = program.opts().format;
      if (format === "json") {
        console.log(formatJSON(projects));
      } else {
        console.log(formatTable(projects.map(projectToRow), PROJECT_COLUMNS));
      }
    });

  project
    .command("show <ref>")
    .description("Show project details (by ID or name)")
    .action(async (ref) => {
      const resolved = await resolveProject(invokeDaemon, ref);
      if (!resolved.ok) {
        console.error(resolved.message);
        process.exitCode = 1;
        return;
      }

      await printProject(program, invokeDaemon, resolved.value);
    });

  project
    .command("update <ref>")
    .description("Update a project (by ID or name)")
    .option("--name <name>", "new name")
    .option("--description <desc>", "new description")
    .option("--status <status>", "new status (active, done, canceled)")
    .option("--priority <priority>", "new priority (low, medium, high)")
    .action(async (ref, opts) => {
      const resolved = await resolveProject(invokeDaemon, ref);
      if (!resolved.ok) {
        console.error(resolved.message);
        process.exitCode = 1;
        return;
      }

      const result = await invokeDaemon<Project>("project.update", {
        id: resolved.value.id,
        input: {
          name: opts.name,
          description: opts.description,
          status: opts.status,
          priority: opts.priority,
        },
      });

      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }

      await printProject(program, invokeDaemon, result.value, "Project updated:");
    });

  const auth = project.command("auth").description("Manage project authorized assignee actors");

  auth
    .command("show <ref>")
    .description("Show a project's authorized actor list")
    .action(async (ref) => {
      const resolved = await resolveProject(invokeDaemon, ref);
      if (!resolved.ok) {
        console.error(resolved.message);
        process.exitCode = 1;
        return;
      }

      await printProject(program, invokeDaemon, resolved.value);
    });

  auth
    .command("add <ref> <actorIds...>")
    .description("Add one or more actor IDs to a project's authorized list")
    .action(async (ref, actorIds: string[]) => {
      const resolved = await resolveProject(invokeDaemon, ref);
      if (!resolved.ok) {
        console.error(resolved.message);
        process.exitCode = 1;
        return;
      }

      const result = await invokeDaemon<Project>("project.addAuthorizedActors", {
        id: resolved.value.id,
        actorIds,
      });
      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }

      await printProject(program, invokeDaemon, result.value, "Project authorization updated:");
    });

  auth
    .command("remove <ref> <actorIds...>")
    .description("Remove one or more actor IDs from a project's authorized list")
    .action(async (ref, actorIds: string[]) => {
      const resolved = await resolveProject(invokeDaemon, ref);
      if (!resolved.ok) {
        console.error(resolved.message);
        process.exitCode = 1;
        return;
      }

      const result = await invokeDaemon<Project>("project.removeAuthorizedActors", {
        id: resolved.value.id,
        actorIds,
      });
      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }

      await printProject(program, invokeDaemon, result.value, "Project authorization updated:");
    });

  auth
    .command("set <ref> [actorIds...]")
    .description("Replace a project's authorized list (omit actor IDs to clear it)")
    .action(async (ref, actorIds: string[] = []) => {
      const resolved = await resolveProject(invokeDaemon, ref);
      if (!resolved.ok) {
        console.error(resolved.message);
        process.exitCode = 1;
        return;
      }

      const result = await invokeDaemon<Project>("project.setAuthorizedActors", {
        id: resolved.value.id,
        actorIds,
      });
      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }

      await printProject(program, invokeDaemon, result.value, "Project authorization updated:");
    });

  project
    .command("delete <ref>")
    .description("Delete a project (by ID or name)")
    .action(async (ref) => {
      const resolved = await resolveProject(invokeDaemon, ref);
      if (!resolved.ok) {
        console.error(resolved.message);
        process.exitCode = 1;
        return;
      }

      const result = await invokeDaemon<null>("project.delete", { id: resolved.value.id });
      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }

      const format = program.opts().format;
      if (format === "json") {
        console.log(formatJSON({ deleted: resolved.value.id }));
      } else {
        console.log(`Deleted project: ${resolved.value.name} (${resolved.value.id})`);
      }
    });
}
