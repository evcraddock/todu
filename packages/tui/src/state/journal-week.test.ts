import { describe, expect, it } from "vitest";
import { createJournalWeek, moveJournalWeek } from "./journal-week.js";

describe("journal week", () => {
  it("uses Sunday through Saturday boundaries", () => {
    const week = createJournalWeek(new Date(2026, 6, 22, 12));

    expect(week.startDate).toBe("2026-07-19");
    expect(week.endDate).toBe("2026-07-25");
    expect(week.label).toBe("Jul 19 – Jul 25, 2026");
  });

  it("moves between adjacent weeks", () => {
    const selectedDate = new Date(2026, 6, 22, 12);

    expect(createJournalWeek(moveJournalWeek(selectedDate, "next")).startDate).toBe("2026-07-26");
    expect(createJournalWeek(moveJournalWeek(selectedDate, "previous")).startDate).toBe(
      "2026-07-12",
    );
  });

  it("formats labels across month and year boundaries", () => {
    expect(createJournalWeek(new Date(2026, 11, 31, 12)).label).toBe("Dec 27, 2026 – Jan 2, 2027");
  });
});
