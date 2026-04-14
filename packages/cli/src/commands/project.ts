import type { Project, ProjectStatus } from "@todu/core";
import { isProjectStatus } from "@todu/core";
import type { Command } from "commander";
import { buildActorMap, formatActorList } from "../actor-display.js";
import { type CliDaemonInvoker, formatDaemonCommandError } from "../daemon-command-client.js";
import { colorPriority, colorStatus, formatJSON, formatTable } from "../format.js";

const PROJECT_COLUMNS = [
  { key: "id", label: "ID" },
  { key: "name", label: "Name" },
  { key: "status", label: "Status", colorize: colorStatus },
  { key: "priority", label: "Priority", colorize: colorPriority },
];

function projectToRow(p: Project): Record<string, string> {
  return {
    id: p.id,
    name: p.name,
    status: p.status,
    priority: p.priority,
  };
}

function projectDetail(p: Project, actorMap: Awaited<ReturnType<typeof buildActorMap>>): string {
  const lines = [
    `ID:          ${p.id}`,
    `Name:        ${p.name}`,
    `Status:      ${p.status}`,
    `Priority:    ${p.priority}`,
    `Actors:      ${formatActorList(p.authorizedAssigneeActorIds, actorMap, [], { includeIds: true })}`,
    `Created:     ${p.createdAt}`,
    `Updated:     ${p.updatedAt}`,
  ];
  if (p.description) {
    lines.push(`Description: ${p.description}`);
  }
  return lines.join("\n");
}

/**
 * Resolve a project reference — try as ID first, then search by name.
 */
async function resolveProject(
  invokeDaemon: CliDaemonInvoker,
  ref: string,
): Promise<{ ok: true; value: Project } | { ok: false; message: string }> {
  // Try as ID
  const byId = await invokeDaemon<Project>("project.get", { id: ref });
  if (byId.ok) {
    return byId;
  }

  if (byId.error.code !== "NOT_FOUND") {
    return { ok: false, message: formatDaemonCommandError(byId.error) };
  }

  // Try name search
  const list = await invokeDaemon<Project[]>("project.list", {});
  if (!list.ok) {
    return { ok: false, message: formatDaemonCommandError(list.error) };
  }

  const matches = list.value.filter((p) => p.name.toLowerCase() === ref.toLowerCase());
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

  // create
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

      const format = program.opts().format;
      if (format === "json") {
        console.log(formatJSON(result.value));
      } else {
        const actorMap = await buildActorMap(invokeDaemon);
        console.log("Project created:");
        console.log(projectDetail(result.value, actorMap));
      }
    });

  // list
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
        projects = projects.filter((p) => p.status === (opts.status as ProjectStatus));
      }

      const format = program.opts().format;
      if (format === "json") {
        console.log(formatJSON(projects));
      } else {
        console.log(formatTable(projects.map(projectToRow), PROJECT_COLUMNS));
      }
    });

  // show
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

      const format = program.opts().format;
      if (format === "json") {
        console.log(formatJSON(resolved.value));
      } else {
        const actorMap = await buildActorMap(invokeDaemon);
        console.log(projectDetail(resolved.value, actorMap));
      }
    });

  // update
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

      const format = program.opts().format;
      if (format === "json") {
        console.log(formatJSON(result.value));
      } else {
        const actorMap = await buildActorMap(invokeDaemon);
        console.log("Project updated:");
        console.log(projectDetail(result.value, actorMap));
      }
    });

  // delete
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
