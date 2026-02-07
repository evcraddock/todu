import type { Project, ProjectId, ProjectStatus } from "@todu/core";
import { createProjectId, isProjectStatus } from "@todu/core";
import type { Todu } from "@todu/engine";
import type { Command } from "commander";
import { formatError, formatJSON, formatTable } from "../format.js";

const PROJECT_COLUMNS = [
  { key: "id", label: "ID" },
  { key: "name", label: "Name" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
];

function projectToRow(p: Project): Record<string, string> {
  return {
    id: p.id,
    name: p.name,
    status: p.status,
    priority: p.priority,
  };
}

function projectDetail(p: Project): string {
  const lines = [
    `ID:          ${p.id}`,
    `Name:        ${p.name}`,
    `Status:      ${p.status}`,
    `Priority:    ${p.priority}`,
    `Sync:        ${p.syncStrategy}`,
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
  todu: Todu,
  ref: string,
): Promise<{ ok: true; value: Project } | { ok: false; message: string }> {
  // Try as ID
  const byId = await todu.project.get(createProjectId(ref) as ProjectId);
  if (byId.ok) return byId;

  // Try name search
  const list = await todu.project.list();
  if (!list.ok) return { ok: false, message: formatError(list.error) };

  const matches = list.value.filter((p) => p.name.toLowerCase() === ref.toLowerCase());
  if (matches.length === 1) return { ok: true, value: matches[0] };
  if (matches.length > 1) {
    return { ok: false, message: `Multiple projects match "${ref}". Use the project ID instead.` };
  }

  return { ok: false, message: `Project not found: ${ref}` };
}

export function registerProjectCommands(program: Command, getTodu: () => Promise<Todu>): void {
  const project = program.command("project").description("Manage projects");

  // create
  project
    .command("create")
    .description("Create a new project")
    .requiredOption("--name <name>", "project name")
    .option("--description <desc>", "project description")
    .option("--priority <priority>", "priority (low, medium, high)", "medium")
    .action(async (opts) => {
      const todu = await getTodu();
      try {
        const result = await todu.project.create({
          name: opts.name,
          description: opts.description,
          priority: opts.priority,
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
          console.log("Project created:");
          console.log(projectDetail(result.value));
        }
      } finally {
        await todu.close();
      }
    });

  // list
  project
    .command("list")
    .description("List projects")
    .option("--status <status>", "filter by status (active, done, canceled)")
    .action(async (opts) => {
      const todu = await getTodu();
      try {
        const result = await todu.project.list();

        if (!result.ok) {
          console.error(formatError(result.error));
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
      } finally {
        await todu.close();
      }
    });

  // show
  project
    .command("show <ref>")
    .description("Show project details (by ID or name)")
    .action(async (ref) => {
      const todu = await getTodu();
      try {
        const resolved = await resolveProject(todu, ref);
        if (!resolved.ok) {
          console.error(resolved.message);
          process.exitCode = 1;
          return;
        }

        const format = program.opts().format;
        if (format === "json") {
          console.log(formatJSON(resolved.value));
        } else {
          console.log(projectDetail(resolved.value));
        }
      } finally {
        await todu.close();
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
      const todu = await getTodu();
      try {
        const resolved = await resolveProject(todu, ref);
        if (!resolved.ok) {
          console.error(resolved.message);
          process.exitCode = 1;
          return;
        }

        const result = await todu.project.update(resolved.value.id, {
          name: opts.name,
          description: opts.description,
          status: opts.status,
          priority: opts.priority,
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
          console.log("Project updated:");
          console.log(projectDetail(result.value));
        }
      } finally {
        await todu.close();
      }
    });

  // delete
  project
    .command("delete <ref>")
    .description("Delete a project (by ID or name)")
    .action(async (ref) => {
      const todu = await getTodu();
      try {
        const resolved = await resolveProject(todu, ref);
        if (!resolved.ok) {
          console.error(resolved.message);
          process.exitCode = 1;
          return;
        }

        const result = await todu.project.delete(resolved.value.id);
        if (!result.ok) {
          console.error(formatError(result.error));
          process.exitCode = 1;
          return;
        }

        const format = program.opts().format;
        if (format === "json") {
          console.log(formatJSON({ deleted: resolved.value.id }));
        } else {
          console.log(`Deleted project: ${resolved.value.name} (${resolved.value.id})`);
        }
      } finally {
        await todu.close();
      }
    });
}
