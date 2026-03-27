import type { Note, NoteFilter } from "@todu/core/browser";

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
}

export function resolveSystemTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function formatJournalEntryDate(value: string, timezone: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: timezone,
  });
}

export function formatJournalEntryTime(value: string, timezone: string): string {
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timezone,
  });
}

export function formatJournalDayLabel(dateKey: string, timezone: string): string {
  return formatJournalEntryDate(
    zonedDateTimeToUtc(dateKey, timezone, 12, 0, 0, 0).toISOString(),
    timezone,
  );
}

export function zonedDayKey(value: string, timezone: string): string {
  const parts = getZonedParts(new Date(value), timezone);
  return formatDateKey(parts.year, parts.month, parts.day);
}

export function groupJournalNotesByDay(notes: Note[], timezone: string): Map<string, Note[]> {
  const groups = new Map<string, Note[]>();

  for (const note of notes) {
    const day = zonedDayKey(note.createdAt, timezone);
    const existing = groups.get(day);
    if (existing) {
      existing.push(note);
    } else {
      groups.set(day, [note]);
    }
  }

  return groups;
}

export function currentWeekStart(timezone: string, now: Date = new Date()): string {
  const parts = getZonedParts(now, timezone);
  return addDays(formatDateKey(parts.year, parts.month, parts.day), -parts.weekday);
}

export function shiftWeek(startDate: string, deltaWeeks: number): string {
  return addDays(startDate, deltaWeeks * 7);
}

export function formatWeekLabel(startDate: string, timezone: string): string {
  const endDate = addDays(startDate, 6);
  const start = zonedDateTimeToUtc(startDate, timezone, 0, 0, 0, 0);
  const end = zonedDateTimeToUtc(endDate, timezone, 12, 0, 0, 0);

  const startLabel = start.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: timezone,
  });
  const endLabel = end.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: timezone,
  });

  return `${startLabel} – ${endLabel}`;
}

export function weekRangeFilter(startDate: string, timezone: string): NoteFilter {
  const endDate = addDays(startDate, 6);

  return {
    journal: true,
    createdFrom: zonedDateTimeToUtc(startDate, timezone, 0, 0, 0, 0).toISOString(),
    createdTo: zonedDateTimeToUtc(endDate, timezone, 23, 59, 59, 999).toISOString(),
  };
}

function formatDateKey(year: number, month: number, day: number): string {
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function addDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return formatDateKey(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

function getZonedParts(date: Date, timezone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const byType = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    year: Number(byType.year),
    month: Number(byType.month),
    day: Number(byType.day),
    hour: Number(byType.hour),
    minute: Number(byType.minute),
    second: Number(byType.second),
    weekday: WEEKDAY_INDEX[byType.weekday] ?? 0,
  };
}

function zonedDateTimeToUtc(
  dateKey: string,
  timezone: string,
  hour: number,
  minute: number,
  second: number,
  millisecond: number,
): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  const desiredLocalTime = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  let guessUtcTime = desiredLocalTime;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = getZonedParts(new Date(guessUtcTime), timezone);
    const actualLocalTime = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
      millisecond,
    );
    const diff = actualLocalTime - desiredLocalTime;
    if (diff === 0) {
      break;
    }
    guessUtcTime -= diff;
  }

  return new Date(guessUtcTime);
}
