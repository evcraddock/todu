import { createRequire } from "node:module";
import {
  validateRRule as coreValidateRRule,
  type ValidationError,
  validationError,
} from "@todu/core";

// rrule is a CJS package — use createRequire for ESM compatibility
const require = createRequire(import.meta.url);
const rruleModule = require("rrule");

/** Internal RRule instance type (not exposed in public API) */
interface RRuleInstance {
  after(date: Date): Date | null;
  between(start: Date, end: Date, inc?: boolean): Date[];
}

/** Internal: create an RRule from parsed options */
function createRRule(options: Record<string, unknown>): RRuleInstance {
  return new rruleModule.RRule(options) as RRuleInstance;
}

/** Internal: parse an RRULE string into options */
function parseRRuleString(rule: string): Record<string, unknown> {
  return rruleModule.RRule.parseString(rule) as Record<string, unknown>;
}

// ============================================================================
// RRULE parsing and occurrence calculation
// ============================================================================

/**
 * Parse an RRULE string into an internal RRule instance with a start date.
 * Returns the instance for use by nextOccurrence/nextOccurrences.
 * The RRule type is not exposed — consumers use the higher-level functions.
 */
function parseRule(
  rule: string,
  startDate: string,
  timezone: string,
): { rrule: RRuleInstance; error?: never } | { rrule?: never; error: ValidationError } {
  // Validate format first
  const formatError = coreValidateRRule(rule);
  if (formatError) return { error: formatError };

  try {
    // Parse start date as a Date in UTC (rrule library works in UTC internally)
    const dtstart = dateStringToUTC(startDate, timezone);

    // Parse the RRULE string and create instance
    const parsed = parseRRuleString(rule);
    const rrule = createRRule({
      ...parsed,
      dtstart,
    });

    return { rrule };
  } catch (e) {
    return {
      error: validationError(
        "schedule",
        `Failed to parse RRULE: ${e instanceof Error ? e.message : String(e)}`,
      ),
    };
  }
}

/**
 * Calculate the next occurrence after a given date.
 *
 * @param rule - RRULE string
 * @param startDate - Schedule start date (YYYY-MM-DD)
 * @param timezone - IANA timezone
 * @param afterDate - Find next occurrence after this date (YYYY-MM-DD)
 * @param endDate - Optional end date (YYYY-MM-DD) — no occurrences after this
 * @returns Next occurrence as YYYY-MM-DD string, or null if no more occurrences
 */
export function nextOccurrence(
  rule: string,
  startDate: string,
  timezone: string,
  afterDate: string,
  endDate?: string,
): string | null {
  const parsed = parseRule(rule, startDate, timezone);
  if (parsed.error) return null;

  const after = dateStringToUTC(afterDate, timezone);
  const next = parsed.rrule.after(after);

  if (!next) return null;

  // Convert back to date string in the template's timezone
  const dateStr = utcToDateString(next, timezone);

  // Check against end date
  if (endDate && dateStr > endDate) return null;

  return dateStr;
}

/**
 * Calculate the next N occurrences starting from a given date (inclusive).
 * Used for the "upcoming" view.
 *
 * @param rule - RRULE string
 * @param startDate - Schedule start date (YYYY-MM-DD)
 * @param timezone - IANA timezone
 * @param fromDate - Start listing from this date (YYYY-MM-DD), inclusive
 * @param count - Number of occurrences to return
 * @param endDate - Optional end date (YYYY-MM-DD)
 * @returns Array of YYYY-MM-DD date strings
 */
export function nextOccurrences(
  rule: string,
  startDate: string,
  timezone: string,
  fromDate: string,
  count: number,
  endDate?: string,
): string[] {
  const parsed = parseRule(rule, startDate, timezone);
  if (parsed.error) return [];

  const results: string[] = [];

  // Get occurrences starting from the day before fromDate
  // (so fromDate itself is included if it matches)
  const dayBefore = shiftDate(fromDate, -1);
  const after = dateStringToUTC(dayBefore, timezone);

  // Use between() for bounded queries when we have an end date
  const effectiveEnd = endDate ? dateStringToUTC(endDate, timezone) : null;

  let current: Date | null = parsed.rrule.after(after);

  while (current && results.length < count) {
    const dateStr = utcToDateString(current, timezone);

    // Check end date
    if (effectiveEnd && current > effectiveEnd) break;

    results.push(dateStr);
    current = parsed.rrule.after(current);
  }

  return results;
}

/**
 * Check if a specific date is a valid occurrence of the schedule.
 * Used to validate early materialization requests.
 */
export function isScheduledDate(
  rule: string,
  startDate: string,
  timezone: string,
  date: string,
  endDate?: string,
): boolean {
  const parsed = parseRule(rule, startDate, timezone);
  if (parsed.error) return false;

  // Check if date is within bounds
  if (date < startDate) return false;
  if (endDate && date > endDate) return false;

  // Check the day before to see if this date is the next occurrence
  const dayBefore = shiftDate(date, -1);
  const after = dateStringToUTC(dayBefore, timezone);
  const next = parsed.rrule.after(after);

  if (!next) return false;

  const nextStr = utcToDateString(next, timezone);
  return nextStr === date;
}

// ============================================================================
// Human-readable schedule descriptions
// ============================================================================

const DAY_NAMES: Record<string, string> = {
  MO: "Monday",
  TU: "Tuesday",
  WE: "Wednesday",
  TH: "Thursday",
  FR: "Friday",
  SA: "Saturday",
  SU: "Sunday",
};

const SHORT_DAY_NAMES: Record<string, string> = {
  MO: "Mon",
  TU: "Tue",
  WE: "Wed",
  TH: "Thu",
  FR: "Fri",
  SA: "Sat",
  SU: "Sun",
};

/**
 * Convert an RRULE string to a human-readable description.
 */
export function describeSchedule(rule: string): string {
  const parts = parseRRuleParts(rule);
  const freq = (parts.FREQ || "").toUpperCase();
  const interval = parts.INTERVAL ? Number.parseInt(parts.INTERVAL, 10) : 1;
  const byday = parts.BYDAY;
  const bymonthday = parts.BYMONTHDAY;
  const bymonth = parts.BYMONTH;

  switch (freq) {
    case "DAILY": {
      if (interval === 1) {
        if (byday) return `Daily on ${formatDayList(byday)}`;
        return "Daily";
      }
      return `Every ${interval} days`;
    }

    case "WEEKLY": {
      const prefix = interval === 1 ? "Weekly" : `Every ${interval} weeks`;
      if (byday) {
        const days = byday.split(",");
        // Check for common patterns
        if (isWeekdays(days)) return interval === 1 ? "Every weekday" : `${prefix} on weekdays`;
        return `${prefix} on ${formatDayList(byday)}`;
      }
      return prefix;
    }

    case "MONTHLY": {
      const prefix = interval === 1 ? "Monthly" : `Every ${interval} months`;
      if (bymonthday) return `${prefix} on day ${bymonthday}`;
      return prefix;
    }

    case "YEARLY": {
      const prefix = interval === 1 ? "Yearly" : `Every ${interval} years`;
      if (bymonth && bymonthday) {
        const monthName = getMonthName(Number.parseInt(bymonth, 10));
        return `${prefix} on ${monthName} ${bymonthday}`;
      }
      return prefix;
    }

    default:
      return rule;
  }
}

// ============================================================================
// Today helper — get current date in a timezone
// ============================================================================

/**
 * Get today's date in the given timezone as YYYY-MM-DD.
 */
export function todayInTimezone(timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Convert a YYYY-MM-DD date string to a UTC Date object,
 * treating the date as midnight in the given timezone.
 */
function dateStringToUTC(dateStr: string, timezone: string): Date {
  // Parse the date parts
  const [year, month, day] = dateStr.split("-").map(Number);

  // Create a date at midnight UTC first
  const utcDate = new Date(Date.UTC(year, month - 1, day));

  // Get the timezone offset for this date
  // We use a formatter to determine what time it is in the target timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  });

  // Find the offset by comparing the formatted date to the UTC date
  const parts = formatter.formatToParts(utcDate);
  const getPart = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0);

  const tzYear = getPart("year");
  const tzMonth = getPart("month");
  const tzDay = getPart("day");
  const tzHour = getPart("hour");
  const tzMinute = getPart("minute");

  // If the timezone date differs from what we want, we need to adjust
  // We want midnight in the target timezone
  const tzDate = new Date(Date.UTC(tzYear, tzMonth - 1, tzDay, tzHour, tzMinute));
  const offsetMs = tzDate.getTime() - utcDate.getTime();

  // Midnight in the target timezone = UTC midnight minus the offset
  return new Date(Date.UTC(year, month - 1, day) - offsetMs);
}

/**
 * Convert a UTC Date object to a YYYY-MM-DD string in the given timezone.
 */
function utcToDateString(date: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

/**
 * Shift a YYYY-MM-DD date string by N days.
 */
function shiftDate(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Parse an RRULE string into key-value pairs.
 */
function parseRRuleParts(rule: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of rule.split(";")) {
    const [key, value] = part.split("=", 2);
    if (key && value) {
      result[key.toUpperCase()] = value;
    }
  }
  return result;
}

/**
 * Format a comma-separated BYDAY list into human-readable form.
 */
function formatDayList(byday: string): string {
  const days = byday.split(",").map((d) => d.trim().toUpperCase());

  if (days.length === 1) {
    return DAY_NAMES[days[0]] || days[0];
  }

  // Use short names for multiple days
  const names = days.map((d) => SHORT_DAY_NAMES[d] || d);

  if (names.length === 2) {
    return `${names[0]} and ${names[1]}`;
  }

  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

/**
 * Check if a set of days represents weekdays (Mon-Fri).
 */
function isWeekdays(days: string[]): boolean {
  const weekdays = new Set(["MO", "TU", "WE", "TH", "FR"]);
  if (days.length !== 5) return false;
  return days.every((d) => weekdays.has(d.toUpperCase()));
}

/**
 * Get month name from number (1-12).
 */
function getMonthName(month: number): string {
  const names = [
    "",
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return names[month] || String(month);
}
