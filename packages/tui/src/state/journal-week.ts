export interface JournalWeek {
  start: Date;
  end: Date;
  startDate: string;
  endDate: string;
  label: string;
}

export type JournalWeekDirection = "previous" | "next";

export function createJournalWeek(reference: Date): JournalWeek {
  const start = createLocalDate(reference, -reference.getDay());
  const end = createLocalDate(start, 6);

  return {
    start,
    end,
    startDate: formatLocalDate(start),
    endDate: formatLocalDate(end),
    label: formatWeekLabel(start, end),
  };
}

export function moveJournalWeek(reference: Date, direction: JournalWeekDirection): Date {
  return createLocalDate(reference, direction === "next" ? 7 : -7);
}

function createLocalDate(reference: Date, dayOffset: number): Date {
  return new Date(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate() + dayOffset,
    12,
  );
}

function formatLocalDate(date: Date): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatWeekLabel(start: Date, end: Date): string {
  const sameYear = start.getFullYear() === end.getFullYear();
  const monthDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  const monthDayYear = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  if (sameYear) {
    return `${monthDay.format(start)} – ${monthDayYear.format(end)}`;
  }

  return `${monthDayYear.format(start)} – ${monthDayYear.format(end)}`;
}
