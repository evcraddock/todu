import { describe, expect, it } from "vitest";
import {
  generateScheduledTaskId,
  validateDateString,
  validateRRule,
  validateScheduleDefinition,
  validateTimezone,
} from "./schedule.js";

describe("generateScheduledTaskId", () => {
  it("returns the same ID for the same inputs", () => {
    const id1 = generateScheduledTaskId("tmpl-abc", "2026-02-06");
    const id2 = generateScheduledTaskId("tmpl-abc", "2026-02-06");
    expect(id1).toBe(id2);
  });

  it("returns different IDs for different template IDs", () => {
    const id1 = generateScheduledTaskId("tmpl-abc", "2026-02-06");
    const id2 = generateScheduledTaskId("tmpl-xyz", "2026-02-06");
    expect(id1).not.toBe(id2);
  });

  it("returns different IDs for different dates", () => {
    const id1 = generateScheduledTaskId("tmpl-abc", "2026-02-06");
    const id2 = generateScheduledTaskId("tmpl-abc", "2026-02-07");
    expect(id1).not.toBe(id2);
  });

  it("returns a branded TaskId with sched- prefix", () => {
    const id = generateScheduledTaskId("tmpl-abc", "2026-02-06");
    expect(id).toMatch(/^sched-[0-9a-f]{12}$/);
  });

  it("is stable across multiple calls", () => {
    const results = new Set<string>();
    for (let i = 0; i < 100; i++) {
      results.add(generateScheduledTaskId("tmpl-abc", "2026-02-06"));
    }
    expect(results.size).toBe(1);
  });
});

describe("validateRRule", () => {
  it("accepts valid daily rule", () => {
    expect(validateRRule("FREQ=DAILY;INTERVAL=1")).toBeNull();
  });

  it("accepts valid weekly rule with BYDAY", () => {
    expect(validateRRule("FREQ=WEEKLY;BYDAY=MO,WE,FR")).toBeNull();
  });

  it("accepts valid monthly rule", () => {
    expect(validateRRule("FREQ=MONTHLY;BYMONTHDAY=1")).toBeNull();
  });

  it("accepts valid yearly rule", () => {
    expect(validateRRule("FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1")).toBeNull();
  });

  it("accepts simple FREQ=DAILY", () => {
    expect(validateRRule("FREQ=DAILY")).toBeNull();
  });

  it("rejects HOURLY frequency", () => {
    const result = validateRRule("FREQ=HOURLY;INTERVAL=4");
    expect(result).not.toBeNull();
    expect(result!.message).toContain("Sub-daily");
  });

  it("rejects MINUTELY frequency", () => {
    const result = validateRRule("FREQ=MINUTELY;INTERVAL=30");
    expect(result).not.toBeNull();
    expect(result!.message).toContain("Sub-daily");
  });

  it("rejects SECONDLY frequency", () => {
    const result = validateRRule("FREQ=SECONDLY");
    expect(result).not.toBeNull();
    expect(result!.message).toContain("Sub-daily");
  });

  it("rejects missing FREQ", () => {
    const result = validateRRule("INTERVAL=1;BYDAY=MO");
    expect(result).not.toBeNull();
    expect(result!.message).toContain("FREQ");
  });

  it("rejects empty string", () => {
    const result = validateRRule("");
    expect(result).not.toBeNull();
    expect(result!.message).toContain("required");
  });

  it("rejects invalid frequency", () => {
    const result = validateRRule("FREQ=BIWEEKLY");
    expect(result).not.toBeNull();
    expect(result!.message).toContain("Invalid frequency");
  });

  it("rejects malformed parts", () => {
    const result = validateRRule("FREQ=DAILY;GARBAGE");
    expect(result).not.toBeNull();
    expect(result!.message).toContain("Invalid RRULE part");
  });

  it("is case-insensitive for FREQ value", () => {
    expect(validateRRule("FREQ=daily")).toBeNull();
    expect(validateRRule("FREQ=Weekly")).toBeNull();
  });
});

describe("validateDateString", () => {
  it("accepts valid date", () => {
    expect(validateDateString("startDate", "2026-02-06")).toBeNull();
  });

  it("rejects invalid format", () => {
    const result = validateDateString("startDate", "02/06/2026");
    expect(result).not.toBeNull();
    expect(result!.message).toContain("YYYY-MM-DD");
  });

  it("rejects impossible date", () => {
    const result = validateDateString("startDate", "2026-02-30");
    expect(result).not.toBeNull();
    expect(result!.message).toContain("Invalid date");
  });

  it("rejects invalid month", () => {
    const result = validateDateString("startDate", "2026-13-01");
    expect(result).not.toBeNull();
  });

  it("accepts leap year date", () => {
    expect(validateDateString("startDate", "2024-02-29")).toBeNull();
  });

  it("rejects non-leap year Feb 29", () => {
    const result = validateDateString("startDate", "2026-02-29");
    expect(result).not.toBeNull();
  });
});

describe("validateTimezone", () => {
  it("accepts valid timezone", () => {
    expect(validateTimezone("America/Chicago")).toBeNull();
  });

  it("accepts UTC", () => {
    expect(validateTimezone("UTC")).toBeNull();
  });

  it("accepts Europe/London", () => {
    expect(validateTimezone("Europe/London")).toBeNull();
  });

  it("rejects invalid timezone", () => {
    const result = validateTimezone("Fake/Timezone");
    expect(result).not.toBeNull();
    expect(result!.message).toContain("Invalid timezone");
  });

  it("rejects empty string", () => {
    const result = validateTimezone("");
    expect(result).not.toBeNull();
  });
});

describe("validateScheduleDefinition", () => {
  it("accepts valid definition", () => {
    const result = validateScheduleDefinition({
      rule: "FREQ=DAILY",
      timezone: "America/Chicago",
      startDate: "2026-02-01",
    });
    expect(result).toBeNull();
  });

  it("accepts definition with endDate", () => {
    const result = validateScheduleDefinition({
      rule: "FREQ=WEEKLY;BYDAY=MO",
      timezone: "UTC",
      startDate: "2026-02-01",
      endDate: "2026-12-31",
    });
    expect(result).toBeNull();
  });

  it("rejects invalid rule", () => {
    const result = validateScheduleDefinition({
      rule: "FREQ=HOURLY",
      timezone: "UTC",
      startDate: "2026-02-01",
    });
    expect(result).not.toBeNull();
    expect(result!.field).toBe("schedule");
  });

  it("rejects invalid timezone", () => {
    const result = validateScheduleDefinition({
      rule: "FREQ=DAILY",
      timezone: "Fake/Zone",
      startDate: "2026-02-01",
    });
    expect(result).not.toBeNull();
    expect(result!.field).toBe("timezone");
  });

  it("rejects invalid startDate", () => {
    const result = validateScheduleDefinition({
      rule: "FREQ=DAILY",
      timezone: "UTC",
      startDate: "not-a-date",
    });
    expect(result).not.toBeNull();
    expect(result!.field).toBe("startDate");
  });

  it("rejects endDate before startDate", () => {
    const result = validateScheduleDefinition({
      rule: "FREQ=DAILY",
      timezone: "UTC",
      startDate: "2026-06-01",
      endDate: "2026-01-01",
    });
    expect(result).not.toBeNull();
    expect(result!.field).toBe("endDate");
    expect(result!.message).toContain("after start date");
  });

  it("rejects endDate equal to startDate", () => {
    const result = validateScheduleDefinition({
      rule: "FREQ=DAILY",
      timezone: "UTC",
      startDate: "2026-06-01",
      endDate: "2026-06-01",
    });
    expect(result).not.toBeNull();
    expect(result!.field).toBe("endDate");
  });
});
