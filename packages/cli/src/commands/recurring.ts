import type { RecurringId, RecurringTemplate } from "@todu/core";
import { createProjectId, createRecurringId } from "@todu/core";
import { describeSchedule, type Todu } from "@todu/engine";
import type { Command } from "commander";
import { colorPriority, formatError, formatJSON, formatTable } from "../format.js";

const TEMPLATE_COLUMNS = [
  { key: "id", label: "ID" },
  { key: "title", label: "Title" },
  { key: "schedule", label: "Schedule" },
  { key: "project", label: "Project" },
  { key: "priority", label: "Priority", colorize: colorPriority },
  { key: "nextDue", label: "Next Due" },
  { key: "status", label: "Status" },
];

function templateToRow(t: RecurringTemplate, projectName?: string): Record<string, string> {
  return {
    id: t.id,
    title: t.title,
    schedule: describeSchedule(t.schedule),
    project: projectName ?? t.projectId,
    priority: t.priority,
    nextDue: t.nextDue,
    status: t.paused ? "paused" : "active",
  };
}

function templateDetail(t: RecurringTemplate, projectName?: string): string {
  const lines = [
    `ID:          ${t.id}`,
    `Title:       ${t.title}`,
    `Schedule:    ${t.schedule}`,
    `             (${describeSchedule(t.schedule)})`,
    `Timezone:    ${t.timezone}`,
    `Project:     ${projectName ?? t.projectId}`,
    `Priority:    ${t.priority}`,
    `Status:      ${t.paused ? "paused" : "active"}`,
    `Start Date:  ${t.startDate}`,
  ];
  if (t.endDate) lines.push(`End Date:    ${t.endDate}`);
  lines.push(`Next Due:    ${t.nextDue}`);
  if (t.labels.length > 0) lines.push(`Labels:      ${t.labels.join(", ")}`);
  if (t.description) lines.push(`Description: ${t.description}`);
  if (t.skippedDates.length > 0) lines.push(`Skipped:     ${t.skippedDates.join(", ")}`);
  lines.push(`Created:     ${t.createdAt}`);
  lines.push(`Updated:     ${t.updatedAt}`);
  return lines.join("\n");
}

async function resolveTemplate(
  todu: Todu,
  ref: string,
): Promise<{ ok: true; value: RecurringTemplate } | { ok: false; message: string }> {
  // Try as ID first
  const getResult = await todu.recurring.get(ref as RecurringId);
  if (getResult.ok) return { ok: true, value: getResult.value };

  // Try by name
  const listResult = await todu.recurring.list();
  if (!listResult.ok) return { ok: false, message: formatError(listResult.error) };

  const byName = listResult.value.filter((t) => t.title.toLowerCase() === ref.toLowerCase());
  if (byName.length === 1) return { ok: true, value: byName[0] };
  if (byName.length > 1) {
    return { ok: false, message: `Multiple templates match "${ref}". Use the template ID.` };
  }

  return { ok: false, message: `Recurring template not found: ${ref}` };
}

async function getProjectName(todu: Todu, projectId: string): Promise<string> {
  const result = await todu.project.list();
  if (!result.ok) return projectId;
  const project = result.value.find((p) => p.id === projectId);
  return project?.name ?? projectId;
}

async function resolveProjectId(
  todu: Todu,
  ref: string,
): Promise<{ ok: true; value: string } | { ok: false; message: string }> {
  const result = await todu.project.list();
  if (!result.ok) return { ok: false, message: formatError(result.error) };

  // Try by ID
  const byId = result.value.find((p) => p.id === ref);
  if (byId) return { ok: true, value: byId.id };

  // Try by name
  const byName = result.value.filter((p) => p.name.toLowerCase() === ref.toLowerCase());
  if (byName.length === 1) return { ok: true, value: byName[0].id };
  if (byName.length > 1) {
    return { ok: false, message: `Multiple projects match "${ref}". Use the project ID.` };
  }

  return { ok: false, message: `Project not found: ${ref}` };
}

export function registerRecurringCommands(program: Command, getTodu: () => Promise<Todu>): void {
  const recurring = program.command("recurring").description("Manage recurring task templates");

  recurring
    .command("create")
    .description("Create a recurring template")
    .requiredOption("--title <title>", "template title")
    .requiredOption("--schedule <rrule>", "RRULE recurrence pattern")
    .requiredOption("--project <project>", "project name or ID")
    .requiredOption("--timezone <tz>", "IANA timezone")
    .requiredOption("--start-date <date>", "start date (YYYY-MM-DD)")
    .option("--end-date <date>", "end date (YYYY-MM-DD)")
    .option("--priority <priority>", "priority (low, medium, high)")
    .option("--description <text>", "template description")
    .option("--label <labels...>", "labels to apply to generated tasks")
    .action(async (opts) => {
      const todu = await getTodu();
      try {
        const projectRes = await resolveProjectId(todu, opts.project);
        if (!projectRes.ok) {
          console.error(projectRes.message);
          process.exitCode = 1;
          return;
        }

        const result = await todu.recurring.create({
          title: opts.title,
          schedule: opts.schedule,
          timezone: opts.timezone,
          startDate: opts.startDate,
          projectId: createProjectId(projectRes.value),
          description: opts.description,
          priority: opts.priority,
          endDate: opts.endDate,
          labels: opts.label,
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
          const projectName = await getProjectName(todu, result.value.projectId);
          console.log(`Created recurring template: ${result.value.id}`);
          console.log(templateDetail(result.value, projectName));
        }
      } finally {
        await todu.close();
      }
    });

  recurring
    .command("list")
    .description("List recurring templates")
    .option("--active", "show only active templates")
    .option("--paused", "show only paused templates")
    .option("--project <project>", "filter by project")
    .action(async (opts) => {
      const todu = await getTodu();
      try {
        let projectId: string | undefined;
        if (opts.project) {
          const res = await resolveProjectId(todu, opts.project);
          if (!res.ok) {
            console.error(res.message);
            process.exitCode = 1;
            return;
          }
          projectId = res.value;
        }

        const filter: Record<string, unknown> = {};
        if (opts.active) filter.paused = false;
        if (opts.paused) filter.paused = true;
        if (projectId) filter.projectId = createProjectId(projectId);

        const result = await todu.recurring.list(filter);
        if (!result.ok) {
          console.error(formatError(result.error));
          process.exitCode = 1;
          return;
        }

        const format = program.opts().format;
        if (format === "json") {
          console.log(formatJSON(result.value));
          return;
        }

        // Get project names for display
        const projects = await todu.project.list();
        const projectNames: Record<string, string> = {};
        if (projects.ok) {
          for (const p of projects.value) {
            projectNames[p.id] = p.name;
          }
        }

        const rows = result.value.map((t) => templateToRow(t, projectNames[t.projectId]));
        console.log(formatTable(rows, TEMPLATE_COLUMNS));
      } finally {
        await todu.close();
      }
    });

  recurring
    .command("show <id>")
    .description("Show recurring template details")
    .action(async (ref) => {
      const todu = await getTodu();
      try {
        const resolved = await resolveTemplate(todu, ref);
        if (!resolved.ok) {
          console.error(resolved.message);
          process.exitCode = 1;
          return;
        }

        const format = program.opts().format;
        if (format === "json") {
          console.log(formatJSON(resolved.value));
          return;
        }

        const projectName = await getProjectName(todu, resolved.value.projectId);
        console.log(templateDetail(resolved.value, projectName));
      } finally {
        await todu.close();
      }
    });

  recurring
    .command("update <id>")
    .description("Update a recurring template")
    .option("--title <title>", "update title")
    .option("--schedule <rrule>", "update RRULE")
    .option("--timezone <tz>", "update timezone")
    .option("--priority <priority>", "update priority")
    .option("--description <text>", "update description")
    .option("--end-date <date>", "update end date")
    .option("--label <labels...>", "replace labels")
    .option("--project <project>", "move to different project")
    .action(async (ref, opts) => {
      const todu = await getTodu();
      try {
        const resolved = await resolveTemplate(todu, ref);
        if (!resolved.ok) {
          console.error(resolved.message);
          process.exitCode = 1;
          return;
        }

        const input: Record<string, unknown> = {};
        if (opts.title) input.title = opts.title;
        if (opts.schedule) input.schedule = opts.schedule;
        if (opts.timezone) input.timezone = opts.timezone;
        if (opts.priority) input.priority = opts.priority;
        if (opts.description) input.description = opts.description;
        if (opts.endDate) input.endDate = opts.endDate;
        if (opts.label) input.labels = opts.label;
        if (opts.project) {
          const projectRes = await resolveProjectId(todu, opts.project);
          if (!projectRes.ok) {
            console.error(projectRes.message);
            process.exitCode = 1;
            return;
          }
          input.projectId = createProjectId(projectRes.value);
        }

        const result = await todu.recurring.update(resolved.value.id, input);
        if (!result.ok) {
          console.error(formatError(result.error));
          process.exitCode = 1;
          return;
        }

        const format = program.opts().format;
        if (format === "json") {
          console.log(formatJSON(result.value));
        } else {
          console.log(`Updated recurring template: ${result.value.id}`);
        }
      } finally {
        await todu.close();
      }
    });

  recurring
    .command("delete <id>")
    .description("Delete a recurring template")
    .action(async (ref) => {
      const todu = await getTodu();
      try {
        const resolved = await resolveTemplate(todu, ref);
        if (!resolved.ok) {
          console.error(resolved.message);
          process.exitCode = 1;
          return;
        }

        const result = await todu.recurring.delete(resolved.value.id);
        if (!result.ok) {
          console.error(formatError(result.error));
          process.exitCode = 1;
          return;
        }

        const format = program.opts().format;
        if (format === "json") {
          console.log(formatJSON({ deleted: resolved.value.id }));
        } else {
          console.log(`Deleted recurring template: ${resolved.value.id}`);
        }
      } finally {
        await todu.close();
      }
    });

  recurring
    .command("pause <id>")
    .description("Pause a recurring template")
    .action(async (ref) => {
      const todu = await getTodu();
      try {
        const resolved = await resolveTemplate(todu, ref);
        if (!resolved.ok) {
          console.error(resolved.message);
          process.exitCode = 1;
          return;
        }

        const result = await todu.recurring.pause(resolved.value.id);
        if (!result.ok) {
          console.error(formatError(result.error));
          process.exitCode = 1;
          return;
        }

        const format = program.opts().format;
        if (format === "json") {
          console.log(formatJSON(result.value));
        } else {
          console.log(`Paused recurring template: ${resolved.value.id}`);
        }
      } finally {
        await todu.close();
      }
    });

  recurring
    .command("resume <id>")
    .description("Resume a recurring template")
    .action(async (ref) => {
      const todu = await getTodu();
      try {
        const resolved = await resolveTemplate(todu, ref);
        if (!resolved.ok) {
          console.error(resolved.message);
          process.exitCode = 1;
          return;
        }

        const result = await todu.recurring.resume(resolved.value.id);
        if (!result.ok) {
          console.error(formatError(result.error));
          process.exitCode = 1;
          return;
        }

        const format = program.opts().format;
        if (format === "json") {
          console.log(formatJSON(result.value));
        } else {
          console.log(`Resumed recurring template: ${resolved.value.id}`);
        }
      } finally {
        await todu.close();
      }
    });

  recurring
    .command("upcoming")
    .description("Show projected future occurrences (no tasks created)")
    .option("--days <days>", "number of days to look ahead", "14")
    .option("--template <id>", "filter by template ID")
    .action(async (opts) => {
      const todu = await getTodu();
      try {
        const options: Record<string, unknown> = {
          days: Number.parseInt(opts.days, 10),
        };
        if (opts.template) {
          options.templateId = createRecurringId(opts.template);
        }

        const result = await todu.recurring.upcoming(options);
        if (!result.ok) {
          console.error(formatError(result.error));
          process.exitCode = 1;
          return;
        }

        const format = program.opts().format;
        if (format === "json") {
          console.log(formatJSON(result.value));
          return;
        }

        if (result.value.length === 0) {
          console.log("No upcoming occurrences.");
          return;
        }

        const upcomingColumns = [
          { key: "date", label: "Date" },
          { key: "title", label: "Title" },
          { key: "priority", label: "Priority", colorize: colorPriority },
          { key: "schedule", label: "Schedule" },
        ];

        const rows = result.value.map((o) => ({
          date: o.date,
          title: o.title,
          priority: o.priority,
          schedule: o.schedule,
        }));

        console.log(formatTable(rows, upcomingColumns));
      } finally {
        await todu.close();
      }
    });

  recurring
    .command("generate <id> <date>")
    .description("Create a task for a specific future date (early materialization)")
    .action(async (ref, date) => {
      const todu = await getTodu();
      try {
        const resolved = await resolveTemplate(todu, ref);
        if (!resolved.ok) {
          console.error(resolved.message);
          process.exitCode = 1;
          return;
        }

        const result = await todu.recurring.generate(resolved.value.id, date);
        if (!result.ok) {
          console.error(formatError(result.error));
          process.exitCode = 1;
          return;
        }

        const format = program.opts().format;
        if (format === "json") {
          console.log(formatJSON(result.value));
        } else {
          console.log(`Generated task: ${result.value.id} (${result.value.title} on ${date})`);
        }
      } finally {
        await todu.close();
      }
    });
}
