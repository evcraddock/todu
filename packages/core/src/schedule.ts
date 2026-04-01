import crypto from "node:crypto";
import type { TaskId } from "./types.js";
import {
  ALLOWED_FREQUENCIES,
  createTaskId,
  type ValidationError,
  validationError,
} from "./types.js";

// ============================================================================
// Deterministic ID generation
// ============================================================================

/**
 * Generate a deterministic task ID from a template/habit ID and a date.
 * Same inputs always produce the same output, across all devices.
 *
 * Used to prevent duplicate task generation when multiple devices
 * process the same recurring template independently.
 */
export function generateScheduledTaskId(templateId: string, date: string): TaskId {
  const hash = crypto.createHash("sha256").update(`${templateId}|${date}`).digest("hex");
  return createTaskId(`sched-${hash.slice(0, 12)}`);
}

// ============================================================================
// RRULE validation (basic format checks — no library dependency)
// ============================================================================

/**
 * Validate an RRULE string at the format level.
 * This is a lightweight check for @todu/core (no RRULE library dependency).
 * Full parsing and occurrence calculation happens in @todu/engine.
 *
 * Checks:
 * - Must contain FREQ= with an allowed frequency
 * - No sub-daily frequencies (HOURLY, MINUTELY, SECONDLY)
 * - Only known RRULE parts
 */
export function validateRRule(rule: string): ValidationError | null {
  if (!rule || rule.trim().length === 0) {
    return validationError("schedule", "RRULE is required");
  }

  const parts = rule.split(";");
  let foundFreq = false;

  for (const part of parts) {
    const [key, value] = part.split("=", 2);
    if (!key || !value) {
      return validationError("schedule", `Invalid RRULE part: ${part}`);
    }

    const upperKey = key.toUpperCase();

    if (upperKey === "FREQ") {
      foundFreq = true;
      const upperValue = value.toUpperCase();

      // Reject sub-daily frequencies
      if (upperValue === "HOURLY" || upperValue === "MINUTELY" || upperValue === "SECONDLY") {
        return validationError(
          "schedule",
          `Sub-daily frequency "${upperValue}" is not supported. Use DAILY, WEEKLY, MONTHLY, or YEARLY.`,
        );
      }

      if (!(ALLOWED_FREQUENCIES as readonly string[]).includes(upperValue)) {
        return validationError(
          "schedule",
          `Invalid frequency: ${upperValue}. Must be one of: ${ALLOWED_FREQUENCIES.join(", ")}`,
        );
      }
    }
  }

  if (!foundFreq) {
    return validationError("schedule", "RRULE must contain FREQ=");
  }

  return null;
}

// ============================================================================
// Date format validation
// ============================================================================

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate a date string is in YYYY-MM-DD format and represents a real date.
 */
export function validateDateString(field: string, value: string): ValidationError | null {
  if (!DATE_REGEX.test(value)) {
    return validationError(field, `Invalid date format: ${value} (expected YYYY-MM-DD)`);
  }

  // Verify it's a real date (e.g., reject 2026-02-30)
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return validationError(field, `Invalid date: ${value}`);
  }

  return null;
}

/**
 * Validate a timezone string is a valid IANA timezone.
 */
export function validateTimezone(timezone: string): ValidationError | null {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return null;
  } catch {
    return validationError("timezone", `Invalid timezone: ${timezone}`);
  }
}

/**
 * Validate a complete ScheduleDefinition.
 */
export function validateScheduleDefinition(schedule: {
  rule: string;
  timezone: string;
  startDate: string;
  endDate?: string;
}): ValidationError | null {
  const ruleError = validateRRule(schedule.rule);
  if (ruleError) return ruleError;

  const tzError = validateTimezone(schedule.timezone);
  if (tzError) return tzError;

  const startError = validateDateString("startDate", schedule.startDate);
  if (startError) return startError;

  if (schedule.endDate !== undefined) {
    const endError = validateDateString("endDate", schedule.endDate);
    if (endError) return endError;

    // endDate must be after startDate
    if (schedule.endDate <= schedule.startDate) {
      return validationError("endDate", "End date must be after start date");
    }
  }

  return null;
}

/**
 * Convert a YYYY-MM-DD date string to a UTC ISO timestamp at the start or end
 * of that day in the given IANA timezone.
 */
export function dateToTimezoneISO(date: string, bound: "start" | "end", timezone: string): string {
  const [year, month, day] = date.split("-").map(Number);

  // Build a reference UTC date near the target, then compute the timezone offset.
  const refUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  // Use Intl to find the UTC offset for this timezone at the reference time.
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(refUtc);
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)!.value);

  const localAtRef = new Date(
    Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")),
  );
  const offsetMs = localAtRef.getTime() - refUtc.getTime();

  // Target local time: start or end of the requested day.
  const localTarget =
    bound === "start"
      ? Date.UTC(year, month - 1, day, 0, 0, 0, 0)
      : Date.UTC(year, month - 1, day, 23, 59, 59, 999);

  // Subtract offset to get UTC equivalent.
  return new Date(localTarget - offsetMs).toISOString();
}
