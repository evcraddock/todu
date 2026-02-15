import type { Habit, HabitId } from "@todu/core";
import { describeSchedule, type Todu } from "@todu/engine";
import type { Command } from "commander";
import { formatError, formatJSON, formatTable } from "../format.js";

const HABIT_COLUMNS = [
  { key: "id", label: "ID" },
  { key: "title", label: "Title" },
  { key: "schedule", label: "Schedule" },
  { key: "nextDue", label: "Next Due" },
  { key: "status", label: "Status" },
];

function habitToRow(h: Habit): Record<string, string> {
  return {
    id: h.id,
    title: h.title,
    schedule: describeSchedule(h.schedule),
    nextDue: h.nextDue,
    status: h.paused ? "paused" : "active",
  };
}

function habitDetail(h: Habit): string {
  const lines = [
    `ID:          ${h.id}`,
    `Title:       ${h.title}`,
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
  todu: Todu,
  ref: string,
): Promise<{ ok: true; value: Habit } | { ok: false; message: string }> {
  // Try as ID first
  const getResult = await todu.habit.get(ref as HabitId);
  if (getResult.ok) return { ok: true, value: getResult.value };

  // Try by name
  const listResult = await todu.habit.list();
  if (!listResult.ok) return { ok: false, message: formatError(listResult.error) };

  const byName = listResult.value.filter((h) => h.title.toLowerCase() === ref.toLowerCase());
  if (byName.length === 1) return { ok: true, value: byName[0] };
  if (byName.length > 1) {
    return { ok: false, message: `Multiple habits match "${ref}". Use the habit ID.` };
  }

  return { ok: false, message: `Habit not found: ${ref}` };
}

export function registerHabitCommands(program: Command, getTodu: () => Promise<Todu>): void {
  const habit = program.command("habit").description("Manage habits");

  habit
    .command("create")
    .description("Create a habit")
    .requiredOption("--title <title>", "habit title")
    .requiredOption("--schedule <rrule>", "RRULE recurrence pattern")
    .requiredOption("--timezone <tz>", "IANA timezone")
    .requiredOption("--start-date <date>", "start date (YYYY-MM-DD)")
    .option("--end-date <date>", "end date (YYYY-MM-DD)")
    .option("--description <text>", "habit description")
    .action(async (opts) => {
      const todu = await getTodu();
      try {
        const result = await todu.habit.create({
          title: opts.title,
          schedule: opts.schedule,
          timezone: opts.timezone,
          startDate: opts.startDate,
          endDate: opts.endDate,
          description: opts.description,
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
          console.log(`Created habit: ${result.value.id}`);
          console.log(habitDetail(result.value));
        }
      } finally {
        await todu.close();
      }
    });

  habit
    .command("list")
    .description("List habits")
    .option("--active", "show only active habits")
    .option("--paused", "show only paused habits")
    .action(async (opts) => {
      const todu = await getTodu();
      try {
        const filter: Record<string, unknown> = {};
        if (opts.active) filter.paused = false;
        if (opts.paused) filter.paused = true;

        const result = await todu.habit.list(filter);
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

        // Enhance with streak info
        const rows: Record<string, string>[] = [];
        for (const h of result.value) {
          const row = habitToRow(h);
          const streak = await todu.habit.streak(h.id);
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
      } finally {
        await todu.close();
      }
    });

  habit
    .command("show <id>")
    .description("Show habit details with streak info")
    .action(async (ref) => {
      const todu = await getTodu();
      try {
        const resolved = await resolveHabit(todu, ref);
        if (!resolved.ok) {
          console.error(resolved.message);
          process.exitCode = 1;
          return;
        }

        const format = program.opts().format;
        if (format === "json") {
          // Include streak in JSON output
          const streak = await todu.habit.streak(resolved.value.id);
          const data: Record<string, unknown> = { ...resolved.value };
          if (streak.ok) data.streak = streak.value;
          console.log(formatJSON(data));
          return;
        }

        console.log(habitDetail(resolved.value));

        const streak = await todu.habit.streak(resolved.value.id);
        if (streak.ok) {
          console.log("");
          console.log(
            `Streak:      ${streak.value.current > 0 ? `🔥 ${streak.value.current} days` : "0 days"}`,
          );
          console.log(`Longest:     ${streak.value.longest} days`);
          console.log(`Today:       ${streak.value.completedToday ? "✅ Done" : "— Not done"}`);
          console.log(`Total:       ${streak.value.totalCheckins} check-ins`);
        }
      } finally {
        await todu.close();
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
      const todu = await getTodu();
      try {
        const resolved = await resolveHabit(todu, ref);
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

        const result = await todu.habit.update(resolved.value.id, input);
        if (!result.ok) {
          console.error(formatError(result.error));
          process.exitCode = 1;
          return;
        }

        const format = program.opts().format;
        if (format === "json") {
          console.log(formatJSON(result.value));
        } else {
          console.log(`Updated habit: ${result.value.id}`);
        }
      } finally {
        await todu.close();
      }
    });

  habit
    .command("delete <id>")
    .description("Delete a habit")
    .action(async (ref) => {
      const todu = await getTodu();
      try {
        const resolved = await resolveHabit(todu, ref);
        if (!resolved.ok) {
          console.error(resolved.message);
          process.exitCode = 1;
          return;
        }

        const result = await todu.habit.delete(resolved.value.id);
        if (!result.ok) {
          console.error(formatError(result.error));
          process.exitCode = 1;
          return;
        }

        const format = program.opts().format;
        if (format === "json") {
          console.log(formatJSON({ deleted: resolved.value.id }));
        } else {
          console.log(`Deleted habit: ${resolved.value.id}`);
        }
      } finally {
        await todu.close();
      }
    });

  habit
    .command("pause <id>")
    .description("Pause a habit")
    .action(async (ref) => {
      const todu = await getTodu();
      try {
        const resolved = await resolveHabit(todu, ref);
        if (!resolved.ok) {
          console.error(resolved.message);
          process.exitCode = 1;
          return;
        }

        const result = await todu.habit.pause(resolved.value.id);
        if (!result.ok) {
          console.error(formatError(result.error));
          process.exitCode = 1;
          return;
        }

        const format = program.opts().format;
        if (format === "json") {
          console.log(formatJSON(result.value));
        } else {
          console.log(`Paused habit: ${resolved.value.id}`);
        }
      } finally {
        await todu.close();
      }
    });

  habit
    .command("resume <id>")
    .description("Resume a habit")
    .action(async (ref) => {
      const todu = await getTodu();
      try {
        const resolved = await resolveHabit(todu, ref);
        if (!resolved.ok) {
          console.error(resolved.message);
          process.exitCode = 1;
          return;
        }

        const result = await todu.habit.resume(resolved.value.id);
        if (!result.ok) {
          console.error(formatError(result.error));
          process.exitCode = 1;
          return;
        }

        const format = program.opts().format;
        if (format === "json") {
          console.log(formatJSON(result.value));
        } else {
          console.log(`Resumed habit: ${resolved.value.id}`);
        }
      } finally {
        await todu.close();
      }
    });

  habit
    .command("check <id>")
    .description("Check in for today")
    .action(async (ref) => {
      const todu = await getTodu();
      try {
        const resolved = await resolveHabit(todu, ref);
        if (!resolved.ok) {
          console.error(resolved.message);
          process.exitCode = 1;
          return;
        }

        const result = await todu.habit.check(resolved.value.id);
        if (!result.ok) {
          console.error(formatError(result.error));
          process.exitCode = 1;
          return;
        }

        const format = program.opts().format;
        if (format === "json") {
          console.log(formatJSON(result.value));
        } else {
          console.log(`✅ ${resolved.value.title} — checked in for ${result.value.date}`);
          const streak = await todu.habit.streak(resolved.value.id);
          if (streak.ok && streak.value.current > 0) {
            console.log(`🔥 ${streak.value.current} day streak!`);
          }
        }
      } finally {
        await todu.close();
      }
    });

  habit
    .command("uncheck <id>")
    .description("Remove today's check-in")
    .action(async (ref) => {
      const todu = await getTodu();
      try {
        const resolved = await resolveHabit(todu, ref);
        if (!resolved.ok) {
          console.error(resolved.message);
          process.exitCode = 1;
          return;
        }

        const result = await todu.habit.uncheck(resolved.value.id);
        if (!result.ok) {
          console.error(formatError(result.error));
          process.exitCode = 1;
          return;
        }

        const format = program.opts().format;
        if (format === "json") {
          console.log(formatJSON({ unchecked: resolved.value.id }));
        } else {
          console.log(`Unchecked: ${resolved.value.title}`);
        }
      } finally {
        await todu.close();
      }
    });

  habit
    .command("streak <id>")
    .description("Show streak info")
    .action(async (ref) => {
      const todu = await getTodu();
      try {
        const resolved = await resolveHabit(todu, ref);
        if (!resolved.ok) {
          console.error(resolved.message);
          process.exitCode = 1;
          return;
        }

        const result = await todu.habit.streak(resolved.value.id);
        if (!result.ok) {
          console.error(formatError(result.error));
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
      } finally {
        await todu.close();
      }
    });

  habit
    .command("history <id>")
    .description("Show check-in history")
    .option("--days <days>", "number of days to look back", "30")
    .action(async (ref, opts) => {
      const todu = await getTodu();
      try {
        const resolved = await resolveHabit(todu, ref);
        if (!resolved.ok) {
          console.error(resolved.message);
          process.exitCode = 1;
          return;
        }

        const days = Number.parseInt(opts.days, 10);
        const result = await todu.habit.history(resolved.value.id, days);
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
      } finally {
        await todu.close();
      }
    });
}
