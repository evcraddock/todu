import { describe, expect, it } from "vitest";
import {
  describeSchedule,
  isScheduledDate,
  nextOccurrence,
  nextOccurrences,
  todayInTimezone,
} from "./schedule.js";

describe("nextOccurrence", () => {
  it("returns next day for daily rule", () => {
    const next = nextOccurrence("FREQ=DAILY", "2026-01-01", "UTC", "2026-02-06");
    expect(next).toBe("2026-02-07");
  });

  it("returns next occurrence for weekly rule with BYDAY", () => {
    // FREQ=WEEKLY;BYDAY=MO — every Monday
    const next = nextOccurrence("FREQ=WEEKLY;BYDAY=MO", "2026-01-05", "UTC", "2026-02-06");
    // Feb 6, 2026 is Friday, next Monday is Feb 9
    expect(next).toBe("2026-02-09");
  });

  it("returns next occurrence for weekly MWF rule", () => {
    const next = nextOccurrence("FREQ=WEEKLY;BYDAY=MO,WE,FR", "2026-01-01", "UTC", "2026-02-06");
    // Feb 6, 2026 is Friday. Next after Friday is Monday Feb 9
    expect(next).toBe("2026-02-09");
  });

  it("returns next occurrence for monthly rule", () => {
    const next = nextOccurrence("FREQ=MONTHLY;BYMONTHDAY=15", "2026-01-15", "UTC", "2026-02-06");
    expect(next).toBe("2026-02-15");
  });

  it("returns next occurrence for yearly rule", () => {
    const next = nextOccurrence(
      "FREQ=YEARLY;BYMONTH=7;BYMONTHDAY=4",
      "2025-07-04",
      "UTC",
      "2026-02-06",
    );
    expect(next).toBe("2026-07-04");
  });

  it("respects interval", () => {
    // Every 3 days
    const next = nextOccurrence("FREQ=DAILY;INTERVAL=3", "2026-02-01", "UTC", "2026-02-06");
    // Start Feb 1, every 3 days: Feb 1, 4, 7, 10...
    expect(next).toBe("2026-02-07");
  });

  it("returns null when endDate is reached", () => {
    const next = nextOccurrence("FREQ=DAILY", "2026-01-01", "UTC", "2026-02-06", "2026-02-05");
    expect(next).toBeNull();
  });

  it("returns null for invalid RRULE", () => {
    const next = nextOccurrence("INVALID", "2026-01-01", "UTC", "2026-02-06");
    expect(next).toBeNull();
  });

  it("handles timezone correctly", () => {
    // A daily rule in CST should still produce correct dates
    const next = nextOccurrence("FREQ=DAILY", "2026-01-01", "America/Chicago", "2026-02-06");
    expect(next).toBe("2026-02-07");
  });

  it("advances past DST transitions without returning the same local date", () => {
    const next = nextOccurrence("FREQ=DAILY", "2026-03-03", "America/Chicago", "2026-03-09");
    expect(next).toBe("2026-03-10");
  });

  it("advances weekly schedules past DST transitions without returning the same local date", () => {
    const next = nextOccurrence(
      "FREQ=WEEKLY;BYDAY=MO",
      "2026-03-02",
      "America/Chicago",
      "2026-03-09",
    );
    expect(next).toBe("2026-03-16");
  });

  it("skips weekends for weekday rule", () => {
    // FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR — every weekday
    // Feb 6, 2026 is Friday. Next weekday is Monday Feb 9.
    const next = nextOccurrence(
      "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
      "2026-01-05",
      "UTC",
      "2026-02-06",
    );
    expect(next).toBe("2026-02-09");
  });
});

describe("nextOccurrences", () => {
  it("returns requested number of occurrences", () => {
    const dates = nextOccurrences("FREQ=DAILY", "2026-01-01", "UTC", "2026-02-06", 5);
    expect(dates).toHaveLength(5);
    expect(dates[0]).toBe("2026-02-06");
    expect(dates[1]).toBe("2026-02-07");
    expect(dates[2]).toBe("2026-02-08");
    expect(dates[3]).toBe("2026-02-09");
    expect(dates[4]).toBe("2026-02-10");
  });

  it("returns only weekdays for weekday rule", () => {
    const dates = nextOccurrences(
      "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
      "2026-01-05",
      "UTC",
      "2026-02-09", // Monday
      5,
    );
    expect(dates).toHaveLength(5);
    expect(dates[0]).toBe("2026-02-09"); // Mon
    expect(dates[1]).toBe("2026-02-10"); // Tue
    expect(dates[2]).toBe("2026-02-11"); // Wed
    expect(dates[3]).toBe("2026-02-12"); // Thu
    expect(dates[4]).toBe("2026-02-13"); // Fri
  });

  it("stops at endDate", () => {
    const dates = nextOccurrences(
      "FREQ=DAILY",
      "2026-01-01",
      "UTC",
      "2026-02-06",
      100,
      "2026-02-08",
    );
    expect(dates).toHaveLength(3);
    expect(dates[0]).toBe("2026-02-06");
    expect(dates[1]).toBe("2026-02-07");
    expect(dates[2]).toBe("2026-02-08");
  });

  it("returns empty for invalid RRULE", () => {
    const dates = nextOccurrences("INVALID", "2026-01-01", "UTC", "2026-02-06", 5);
    expect(dates).toHaveLength(0);
  });

  it("includes fromDate if it matches schedule", () => {
    // Weekly on Monday, fromDate is a Monday
    const dates = nextOccurrences(
      "FREQ=WEEKLY;BYDAY=MO",
      "2026-01-05",
      "UTC",
      "2026-02-09", // Monday
      3,
    );
    expect(dates[0]).toBe("2026-02-09");
  });

  it("returns monthly occurrences", () => {
    const dates = nextOccurrences(
      "FREQ=MONTHLY;BYMONTHDAY=1",
      "2026-01-01",
      "UTC",
      "2026-01-01",
      4,
    );
    expect(dates).toEqual(["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01"]);
  });
});

describe("isScheduledDate", () => {
  it("returns true for a valid daily occurrence", () => {
    expect(isScheduledDate("FREQ=DAILY", "2026-01-01", "UTC", "2026-02-06")).toBe(true);
  });

  it("returns true for a valid weekly occurrence", () => {
    // FREQ=WEEKLY;BYDAY=MO, start Jan 5 (Monday)
    // Feb 9, 2026 is Monday
    expect(isScheduledDate("FREQ=WEEKLY;BYDAY=MO", "2026-01-05", "UTC", "2026-02-09")).toBe(true);
  });

  it("returns false for a non-occurrence day", () => {
    // FREQ=WEEKLY;BYDAY=MO, start Jan 5 (Monday)
    // Feb 10, 2026 is Tuesday — not a Monday
    expect(isScheduledDate("FREQ=WEEKLY;BYDAY=MO", "2026-01-05", "UTC", "2026-02-10")).toBe(false);
  });

  it("returns false for date before startDate", () => {
    expect(isScheduledDate("FREQ=DAILY", "2026-03-01", "UTC", "2026-02-06")).toBe(false);
  });

  it("returns false for date after endDate", () => {
    expect(isScheduledDate("FREQ=DAILY", "2026-01-01", "UTC", "2026-03-01", "2026-02-28")).toBe(
      false,
    );
  });

  it("returns false for invalid RRULE", () => {
    expect(isScheduledDate("INVALID", "2026-01-01", "UTC", "2026-02-06")).toBe(false);
  });

  it("recognizes scheduled dates after DST transitions", () => {
    expect(isScheduledDate("FREQ=DAILY", "2026-03-03", "America/Chicago", "2026-03-10")).toBe(true);
  });

  it("handles interval correctly", () => {
    // Every 2 days starting Feb 1: Feb 1, 3, 5, 7, 9...
    expect(isScheduledDate("FREQ=DAILY;INTERVAL=2", "2026-02-01", "UTC", "2026-02-07")).toBe(true);
    expect(isScheduledDate("FREQ=DAILY;INTERVAL=2", "2026-02-01", "UTC", "2026-02-08")).toBe(false);
  });
});

describe("describeSchedule", () => {
  it("describes daily rule", () => {
    expect(describeSchedule("FREQ=DAILY")).toBe("Daily");
  });

  it("describes daily with interval", () => {
    expect(describeSchedule("FREQ=DAILY;INTERVAL=3")).toBe("Every 3 days");
  });

  it("describes weekly with single day", () => {
    expect(describeSchedule("FREQ=WEEKLY;BYDAY=MO")).toBe("Weekly on Monday");
  });

  it("describes weekly with two days", () => {
    expect(describeSchedule("FREQ=WEEKLY;BYDAY=MO,FR")).toBe("Weekly on Mon and Fri");
  });

  it("describes weekly with multiple days", () => {
    expect(describeSchedule("FREQ=WEEKLY;BYDAY=MO,WE,FR")).toBe("Weekly on Mon, Wed, and Fri");
  });

  it("describes weekday pattern", () => {
    expect(describeSchedule("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR")).toBe("Every weekday");
  });

  it("describes monthly with day", () => {
    expect(describeSchedule("FREQ=MONTHLY;BYMONTHDAY=1")).toBe("Monthly on day 1");
  });

  it("describes monthly with interval", () => {
    expect(describeSchedule("FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=15")).toBe(
      "Every 3 months on day 15",
    );
  });

  it("describes yearly", () => {
    expect(describeSchedule("FREQ=YEARLY")).toBe("Yearly");
  });

  it("describes yearly with month and day", () => {
    expect(describeSchedule("FREQ=YEARLY;BYMONTH=7;BYMONTHDAY=4")).toBe("Yearly on July 4");
  });

  it("describes weekly without BYDAY", () => {
    expect(describeSchedule("FREQ=WEEKLY")).toBe("Weekly");
  });

  it("describes bi-weekly", () => {
    expect(describeSchedule("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO")).toBe("Every 2 weeks on Monday");
  });
});

describe("todayInTimezone", () => {
  it("returns a valid YYYY-MM-DD date", () => {
    const today = todayInTimezone("UTC");
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns a date for different timezones", () => {
    const utc = todayInTimezone("UTC");
    const chicago = todayInTimezone("America/Chicago");
    const tokyo = todayInTimezone("Asia/Tokyo");

    // All should be valid dates
    expect(utc).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(chicago).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(tokyo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
