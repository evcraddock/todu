import type { Habit, HabitHistoryEntry, HabitStreak } from "@todu/core";
import { describeSchedule } from "@todu/engine";
import type { Command } from "commander";
import { type CliDaemonInvoker, formatDaemonCommandError } from "../daemon-command-client.js";
import { formatJSON, formatTable } from "../format.js";

const HABIT_COLUMNS = [
  { key: "id", label: "ID" },
  { key: "title", label: "Title" },
  { key: "project", label: "Project" },
  { key: "schedule", label: "Schedule" },
  { key: "nextDue", label: "Next Due" },
  { key: "status", label: "Status" },
];

function habitToRow(h: Habit, projectName?: string): Record<string, string> {
  return {
    id: h.id,
    title: h.title,
    project: projectName ?? h.projectId,
    schedule: describeSchedule(h.schedule),
    nextDue: h.nextDue,
    status: h.paused ? "paused" : "active",
  };
}

function habitDetail(h: Habit, projectName?: string): string {
  const lines = [
    `ID:          ${h.id}`,
    `Title:       ${h.title}`,
    `Project:     ${projectName ?? h.projectId}`,
    `Schedule:    ${h.schedule}`,
    `             (${describeSchedule(h.schedule)})`,
    `Timezone:    ${h.timezone}`,
    `Status:      ${h.paused ? "paused" : "active"}`,
    `Start Date:  ${h.startDate}`,
  ];
  if (h.endDate) lines.push(`End Date:    ${h.endDate}`);
  lines.push(`Next Due:    ${h.nextDue}`);
  if (h.description) lines.push(`Description: ${h.description}`);
  lines.push(`Created:     ${h.createdAt}`);
  lines.push(`Updated:     ${h.updatedAt}`);
  return lines.join("\n");
}

async function resolveHabit(
  invokeDaemon: CliDaemonInvoker,
  ref: string,
): Promise<{ ok: true; value: Habit } | { ok: false; message: string }> {
  const byId = await invokeDaemon<Habit>("habit.get", { id: ref });
  if (byId.ok) {
    return { ok: true, value: byId.value };
  }

  if (byId.error.code !== "NOT_FOUND") {
    return { ok: false, message: formatDaemonCommandError(byId.error) };
  }

  const listResult = await invokeDaemon<Habit[]>("habit.list", {});
  if (!listResult.ok) {
    return { ok: false, message: formatDaemonCommandError(listResult.error) };
  }

  const byName = listResult.value.filter((h) => h.title.toLowerCase() === ref.toLowerCase());
  if (byName.length === 1) {
    return { ok: true, value: byName[0] };
  }

  if (byName.length > 1) {
    return { ok: false, message: `Multiple habits match "${ref}". Use the habit ID.` };
  }

  return { ok: false, message: `Habit not found: ${ref}` };
}

async function getProjectName(invokeDaemon: CliDaemonInvoker, projectId: string): Promise<string> {
  const result = await invokeDaemon<Array<{ id: string; name: string }>>("project.list", {});
  if (!result.ok) {
    return projectId;
  }

  const project = result.value.find((p) => p.id === projectId);
  return project?.name ?? projectId;
}

async function resolveProjectId(
  invokeDaemon: CliDaemonInvoker,
  ref: string,
): Promise<{ ok: true; value: string } | { ok: false; message: string }> {
  const byId = await invokeDaemon<{ id: string }>("project.get", { id: ref });
  if (byId.ok) {
    return { ok: true, value: byId.value.id };
  }

  if (byId.error.code !== "NOT_FOUND") {
    return { ok: false, message: formatDaemonCommandError(byId.error) };
  }

  const result = await invokeDaemon<Array<{ id: string; name: string }>>("project.list", {});
  if (!result.ok) {
    return { ok: false, message: formatDaemonCommandError(result.error) };
  }

  const byName = result.value.filter((p) => p.name.toLowerCase() === ref.toLowerCase());
  if (byName.length === 1) {
    return { ok: true, value: byName[0].id };
  }

  if (byName.length > 1) {
    return { ok: false, message: `Multiple projects match "${ref}". Use the project ID.` };
  }

  return { ok: false, message: `Project not found: ${ref}` };
}

export function registerHabitCommands(program: Command, invokeDaemon: CliDaemonInvoker): void {
  const habit = program.command("habit").description("Manage habits");

  habit
    .command("create")
    .description("Create a habit")
    .requiredOption("--title <title>", "habit title")
    .requiredOption("--project <project>", "project name or ID")
    .requiredOption("--schedule <rrule>", "RRULE recurrence pattern")
    .requiredOption("--timezone <tz>", "IANA timezone")
    .requiredOption("--start-date <date>", "start date (YYYY-MM-DD)")
    .option("--end-date <date>", "end date (YYYY-MM-DD)")
    .option("--description <text>", "habit description")
    .action(async (opts) => {
      const projectRes = await resolveProjectId(invokeDaemon, opts.project);
      if (!projectRes.ok) {
        console.error(projectRes.message);
        process.exitCode = 1;
        return;
      }

      const result = await invokeDaemon<Habit>("habit.create", {
        input: {
          title: opts.title,
          projectId: projectRes.value,
          schedule: opts.schedule,
          timezone: opts.timezone,
          startDate: opts.startDate,
          endDate: opts.endDate,
          description: opts.description,
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
        const projectName = await getProjectName(invokeDaemon, result.value.projectId);
        console.log(`Created habit: ${result.value.id}`);
        console.log(habitDetail(result.value, projectName));
      }
    });

  habit
    .command("list")
    .description("List habits")
    .option("--active", "show only active habits")
    .option("--paused", "show only paused habits")
    .option("--project <project>", "filter by project")
    .action(async (opts) => {
      let projectId: string | undefined;
      if (opts.project) {
        const projectRes = await resolveProjectId(invokeDaemon, opts.project);
        if (!projectRes.ok) {
          console.error(projectRes.message);
          process.exitCode = 1;
          return;
        }
        projectId = projectRes.value;
      }

      const filter: Record<string, unknown> = {};
      if (opts.active) filter.paused = false;
      if (opts.paused) filter.paused = true;
      if (projectId) filter.projectId = projectId;

      const result = await invokeDaemon<Habit[]>("habit.list", { filter });
      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }

      const format = program.opts().format;
      if (format === "json") {
        console.log(formatJSON(result.value));
        return;
      }

      const projects = await invokeDaemon<Array<{ id: string; name: string }>>("project.list", {});
      const projectNames: Record<string, string> = {};
      if (projects.ok) {
        for (const project of projects.value) {
          projectNames[project.id] = project.name;
        }
      }

      const rows: Record<string, string>[] = [];
      for (const h of result.value) {
        const row = habitToRow(h, projectNames[h.projectId]);
        const streak = await invokeDaemon<HabitStreak>("habit.streak", { id: h.id });
        if (streak.ok) {
          row.streak = streak.value.current > 0 ? `🔥 ${streak.value.current}` : "0";
          row.today = streak.value.completedToday ? "✅" : "—";
        }
        rows.push(row);
      }

      const columns = [
        ...HABIT_COLUMNS,
        { key: "streak", label: "Streak" },
        { key: "today", label: "Today" },
      ];

      console.log(formatTable(rows, columns));
    });

  habit
    .command("show <id>")
    .description("Show habit details with streak info")
    .action(async (ref) => {
      const resolved = await resolveHabit(invokeDaemon, ref);
      if (!resolved.ok) {
        console.error(resolved.message);
        process.exitCode = 1;
        return;
      }

      const format = program.opts().format;
      if (format === "json") {
        const streak = await invokeDaemon<HabitStreak>("habit.streak", {
          id: resolved.value.id,
        });
        const data: Record<string, unknown> = { ...resolved.value };
        if (streak.ok) data.streak = streak.value;
        console.log(formatJSON(data));
        return;
      }

      const projectName = await getProjectName(invokeDaemon, resolved.value.projectId);
      console.log(habitDetail(resolved.value, projectName));

      const streak = await invokeDaemon<HabitStreak>("habit.streak", {
        id: resolved.value.id,
      });
      if (streak.ok) {
        console.log("");
        console.log(
          `Streak:      ${streak.value.current > 0 ? `🔥 ${streak.value.current} days` : "0 days"}`,
        );
        console.log(`Longest:     ${streak.value.longest} days`);
        console.log(`Today:       ${streak.value.completedToday ? "✅ Done" : "— Not done"}`);
        console.log(`Total:       ${streak.value.totalCheckins} check-ins`);
      }
    });

  habit
    .command("update <id>")
    .description("Update a habit")
    .option("--title <title>", "update title")
    .option("--schedule <rrule>", "update RRULE")
    .option("--timezone <tz>", "update timezone")
    .option("--description <text>", "update description")
    .option("--end-date <date>", "update end date")
    .action(async (ref, opts) => {
      const resolved = await resolveHabit(invokeDaemon, ref);
      if (!resolved.ok) {
        console.error(resolved.message);
        process.exitCode = 1;
        return;
      }

      const input: Record<string, unknown> = {};
      if (opts.title) input.title = opts.title;
      if (opts.schedule) input.schedule = opts.schedule;
      if (opts.timezone) input.timezone = opts.timezone;
      if (opts.description) input.description = opts.description;
      if (opts.endDate) input.endDate = opts.endDate;

      const result = await invokeDaemon<Habit>("habit.update", {
        id: resolved.value.id,
        input,
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
        console.log(`Updated habit: ${result.value.id}`);
      }
    });

  habit
    .command("delete <id>")
    .description("Delete a habit")
    .action(async (ref) => {
      const resolved = await resolveHabit(invokeDaemon, ref);
      if (!resolved.ok) {
        console.error(resolved.message);
        process.exitCode = 1;
        return;
      }

      const result = await invokeDaemon<null>("habit.delete", { id: resolved.value.id });
      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }

      const format = program.opts().format;
      if (format === "json") {
        console.log(formatJSON({ deleted: resolved.value.id }));
      } else {
        console.log(`Deleted habit: ${resolved.value.id}`);
      }
    });

  habit
    .command("pause <id>")
    .description("Pause a habit")
    .action(async (ref) => {
      const resolved = await resolveHabit(invokeDaemon, ref);
      if (!resolved.ok) {
        console.error(resolved.message);
        process.exitCode = 1;
        return;
      }

      const result = await invokeDaemon<Habit>("habit.pause", { id: resolved.value.id });
      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }

      const format = program.opts().format;
      if (format === "json") {
        console.log(formatJSON(result.value));
      } else {
        console.log(`Paused habit: ${resolved.value.id}`);
      }
    });

  habit
    .command("resume <id>")
    .description("Resume a habit")
    .action(async (ref) => {
      const resolved = await resolveHabit(invokeDaemon, ref);
      if (!resolved.ok) {
        console.error(resolved.message);
        process.exitCode = 1;
        return;
      }

      const result = await invokeDaemon<Habit>("habit.resume", { id: resolved.value.id });
      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }

      const format = program.opts().format;
      if (format === "json") {
        console.log(formatJSON(result.value));
      } else {
        console.log(`Resumed habit: ${resolved.value.id}`);
      }
    });

  habit
    .command("check <id>")
    .description("Check in for today")
    .action(async (ref) => {
      const resolved = await resolveHabit(invokeDaemon, ref);
      if (!resolved.ok) {
        console.error(resolved.message);
        process.exitCode = 1;
        return;
      }

      const result = await invokeDaemon<{ date: string; completed: boolean }>("habit.check", {
        id: resolved.value.id,
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
        console.log(`✅ ${resolved.value.title} — checked in for ${result.value.date}`);
        const streak = await invokeDaemon<HabitStreak>("habit.streak", {
          id: resolved.value.id,
        });
        if (streak.ok && streak.value.current > 0) {
          console.log(`🔥 ${streak.value.current} day streak!`);
        }
      }
    });

  habit
    .command("uncheck <id>")
    .description("Remove today's check-in")
    .action(async (ref) => {
      const resolved = await resolveHabit(invokeDaemon, ref);
      if (!resolved.ok) {
        console.error(resolved.message);
        process.exitCode = 1;
        return;
      }

      const result = await invokeDaemon<null>("habit.uncheck", { id: resolved.value.id });
      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }

      const format = program.opts().format;
      if (format === "json") {
        console.log(formatJSON({ unchecked: resolved.value.id }));
      } else {
        console.log(`Unchecked: ${resolved.value.title}`);
      }
    });

  habit
    .command("streak <id>")
    .description("Show streak info")
    .action(async (ref) => {
      const resolved = await resolveHabit(invokeDaemon, ref);
      if (!resolved.ok) {
        console.error(resolved.message);
        process.exitCode = 1;
        return;
      }

      const result = await invokeDaemon<HabitStreak>("habit.streak", {
        id: resolved.value.id,
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
        console.log(`${resolved.value.title}`);
        console.log(
          `Current:  ${result.value.current > 0 ? `🔥 ${result.value.current} days` : "0 days"}`,
        );
        console.log(`Longest:  ${result.value.longest} days`);
        console.log(`Today:    ${result.value.completedToday ? "✅ Done" : "— Not done"}`);
        console.log(`Total:    ${result.value.totalCheckins} check-ins`);
      }
    });

  habit
    .command("history <id>")
    .description("Show check-in history")
    .option("--days <days>", "number of days to look back", "30")
    .action(async (ref, opts) => {
      const resolved = await resolveHabit(invokeDaemon, ref);
      if (!resolved.ok) {
        console.error(resolved.message);
        process.exitCode = 1;
        return;
      }

      const days = Number.parseInt(opts.days, 10);
      const result = await invokeDaemon<HabitHistoryEntry[]>("habit.history", {
        id: resolved.value.id,
        days,
      });
      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }

      const format = program.opts().format;
      if (format === "json") {
        console.log(formatJSON(result.value));
        return;
      }

      if (result.value.length === 0) {
        console.log("No history.");
        return;
      }

      console.log(`${resolved.value.title} — last ${days} days`);
      console.log("");

      const columns = [
        { key: "date", label: "Date" },
        { key: "status", label: "Status" },
      ];

      const rows = result.value.map((entry) => ({
        date: entry.date,
        status: entry.completed ? "✅" : "—",
      }));

      console.log(formatTable(rows, columns));
    });
}
