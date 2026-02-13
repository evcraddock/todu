/**
 * Browser-safe RRULE description. Mirrors the engine's describeSchedule()
 * without needing node:module or the rrule CJS package.
 */

const DAY_NAMES: Record<string, string> = {
  MO: "Monday",
  TU: "Tuesday",
  WE: "Wednesday",
  TH: "Thursday",
  FR: "Friday",
  SA: "Saturday",
  SU: "Sunday",
};

const MONTH_NAMES = [
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

function parseRRuleParts(rule: string): Record<string, string> {
  const parts: Record<string, string> = {};
  for (const segment of rule.split(";")) {
    const [key, value] = segment.split("=");
    if (key && value) parts[key.toUpperCase()] = value;
  }
  return parts;
}

function formatDayList(byday: string): string {
  return byday
    .split(",")
    .map((d) => DAY_NAMES[d.toUpperCase()] ?? d)
    .join(", ");
}

function isWeekdays(days: string[]): boolean {
  const weekdays = new Set(["MO", "TU", "WE", "TH", "FR"]);
  return days.length === 5 && days.every((d) => weekdays.has(d.toUpperCase()));
}

export function describeSchedule(rule: string): string {
  const parts = parseRRuleParts(rule);
  const freq = (parts.FREQ ?? "").toUpperCase();
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
        const monthName = MONTH_NAMES[Number.parseInt(bymonth, 10)] ?? bymonth;
        return `${prefix} on ${monthName} ${bymonthday}`;
      }
      return prefix;
    }
    default:
      return rule;
  }
}
