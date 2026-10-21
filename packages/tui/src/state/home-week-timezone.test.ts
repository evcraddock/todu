import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const moduleUrl = new URL("./home-sections.ts", import.meta.url).href;

const timezoneCases = [
  {
    timezone: "America/Chicago",
    dates: [
      ["2026-03-08T05:30:00Z", "2026-03-07", "2026-03-07"],
      ["2026-03-08T08:30:00Z", "2026-03-08", "2026-03-14"],
      ["2026-11-01T04:30:00Z", "2026-10-31", "2026-10-31"],
      ["2026-11-01T06:30:00Z", "2026-11-01", "2026-11-07"],
      ["2026-11-01T07:30:00Z", "2026-11-01", "2026-11-07"],
    ],
  },
  {
    timezone: "Europe/London",
    dates: [
      ["2026-03-28T23:30:00Z", "2026-03-28", "2026-03-28"],
      ["2026-03-29T01:30:00Z", "2026-03-29", "2026-04-04"],
      ["2026-10-24T23:30:00Z", "2026-10-25", "2026-10-31"],
      ["2026-10-25T01:30:00Z", "2026-10-25", "2026-10-31"],
    ],
  },
  {
    timezone: "Pacific/Auckland",
    dates: [
      ["2026-04-04T10:30:00Z", "2026-04-04", "2026-04-04"],
      ["2026-04-04T14:30:00Z", "2026-04-05", "2026-04-11"],
      ["2026-09-26T10:30:00Z", "2026-09-26", "2026-09-26"],
      ["2026-09-26T14:30:00Z", "2026-09-27", "2026-10-03"],
    ],
  },
];

describe("Home local week across daylight-saving transitions", () => {
  it.each(timezoneCases)("uses local dates and retains carryover in $timezone", ({
    timezone,
    dates,
  }) => {
    const script = `
      import { addCalendarDays, createHomeTaskSections, endOfWeek, localDateString } from ${JSON.stringify(moduleUrl)};
      const dates = ${JSON.stringify(dates)};
      const results = dates.map(([instant, , expectedEnd]) => {
        const today = localDateString(new Date(instant));
        const tasks = [
          { id: "carryover", status: "active", priority: "low", scheduledDate: "2025-01-05" },
          { id: "saturday", status: "active", priority: "medium", scheduledDate: expectedEnd },
          { id: "next-sunday", status: "active", priority: "high", scheduledDate: addCalendarDays(expectedEnd, 1) },
        ].map(Object.freeze);
        return {
          today,
          weekEnd: endOfWeek(today),
          included: createHomeTaskSections(Object.freeze(tasks), today).thisWeek.map(task => task.id),
          originalScheduledDate: tasks[0].scheduledDate,
        };
      });
      console.log(JSON.stringify(results));
    `;
    const result = execFileSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", script],
      { encoding: "utf8", env: { ...process.env, TZ: timezone }, timeout: 10_000 },
    );

    expect(JSON.parse(result)).toEqual(
      dates.map(([, today, weekEnd]) => ({
        today,
        weekEnd,
        included: ["carryover", "saturday"],
        originalScheduledDate: "2025-01-05",
      })),
    );
  });
});
