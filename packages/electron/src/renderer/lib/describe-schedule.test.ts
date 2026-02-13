import { describe, expect, it } from "vitest";
import { describeSchedule } from "./describe-schedule.js";

describe("describeSchedule", () => {
  it("describes daily", () => {
    expect(describeSchedule("FREQ=DAILY")).toBe("Daily");
  });

  it("describes daily with interval", () => {
    expect(describeSchedule("FREQ=DAILY;INTERVAL=3")).toBe("Every 3 days");
  });

  it("describes daily with byday", () => {
    expect(describeSchedule("FREQ=DAILY;BYDAY=MO,WE")).toBe("Daily on Monday, Wednesday");
  });

  it("describes weekdays", () => {
    expect(describeSchedule("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR")).toBe("Every weekday");
  });

  it("describes weekly on specific day", () => {
    expect(describeSchedule("FREQ=WEEKLY;BYDAY=TU")).toBe("Weekly on Tuesday");
  });

  it("describes weekly with interval", () => {
    expect(describeSchedule("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR")).toBe(
      "Every 2 weeks on Monday, Friday",
    );
  });

  it("describes weekly without byday", () => {
    expect(describeSchedule("FREQ=WEEKLY")).toBe("Weekly");
  });

  it("describes monthly on day", () => {
    expect(describeSchedule("FREQ=MONTHLY;BYMONTHDAY=15")).toBe("Monthly on day 15");
  });

  it("describes monthly with interval", () => {
    expect(describeSchedule("FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=1")).toBe(
      "Every 3 months on day 1",
    );
  });

  it("describes monthly without bymonthday", () => {
    expect(describeSchedule("FREQ=MONTHLY")).toBe("Monthly");
  });

  it("describes yearly", () => {
    expect(describeSchedule("FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=15")).toBe("Yearly on March 15");
  });

  it("describes yearly with interval", () => {
    expect(describeSchedule("FREQ=YEARLY;INTERVAL=2")).toBe("Every 2 years");
  });

  it("returns raw rule for unknown frequency", () => {
    expect(describeSchedule("SOMETHING=WEIRD")).toBe("SOMETHING=WEIRD");
  });

  it("handles case insensitivity in parts", () => {
    expect(describeSchedule("freq=daily")).toBe("Daily");
  });
});
