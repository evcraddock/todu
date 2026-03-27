import type { Note } from "@todu/core/browser";
import { describe, expect, it } from "vitest";
import {
  currentWeekStart,
  formatJournalDayLabel,
  formatJournalEntryTime,
  formatWeekLabel,
  groupJournalNotesByDay,
  shiftWeek,
  weekRangeFilter,
  zonedDayKey,
} from "../lib/journal-time.js";

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "note-1" as Note["id"],
    content: "Test note",
    author: "user",
    tags: [],
    createdAt: "2026-02-13T10:00:00Z",
    ...overrides,
  };
}

describe("journal time helpers", () => {
  it("groups notes by local day in the configured timezone", () => {
    const notes: Note[] = [
      makeNote({ id: "note-1" as Note["id"], createdAt: "2026-02-13T07:30:00Z" }),
      makeNote({ id: "note-2" as Note["id"], createdAt: "2026-02-13T17:00:00Z" }),
    ];

    const groups = groupJournalNotesByDay(notes, "America/Los_Angeles");
    expect(groups.size).toBe(2);
    expect(groups.get("2026-02-12")?.length).toBe(1);
    expect(groups.get("2026-02-13")?.length).toBe(1);
  });

  it("formats times in 12-hour clock with AM/PM", () => {
    expect(formatJournalEntryTime("2026-02-13T17:05:00Z", "America/New_York")).toBe("12:05 PM");
  });

  it("formats a local day label in the configured timezone", () => {
    expect(formatJournalDayLabel("2026-02-13", "America/New_York")).toContain("Friday");
    expect(formatJournalDayLabel("2026-02-13", "America/New_York")).toContain("February");
  });

  it("derives the local day key using the configured timezone", () => {
    expect(zonedDayKey("2026-02-13T07:30:00Z", "America/Los_Angeles")).toBe("2026-02-12");
  });

  it("starts on the current local week", () => {
    expect(currentWeekStart("America/New_York", new Date("2026-03-27T12:00:00Z"))).toBe(
      "2026-03-22",
    );
  });

  it("shifts week anchors by 7 days", () => {
    expect(shiftWeek("2026-03-22", -1)).toBe("2026-03-15");
    expect(shiftWeek("2026-03-22", 1)).toBe("2026-03-29");
  });

  it("builds a week-scoped journal filter with timezone-aware UTC boundaries", () => {
    expect(weekRangeFilter("2026-03-22", "America/New_York")).toEqual({
      journal: true,
      createdFrom: "2026-03-22T04:00:00.000Z",
      createdTo: "2026-03-29T03:59:59.999Z",
    });
  });

  it("formats a readable week label", () => {
    expect(formatWeekLabel("2026-03-22", "America/New_York")).toBe("Mar 22 – Mar 28, 2026");
  });
});
