import type { Note } from "@todu/core/browser";
import { describe, expect, it } from "vitest";
import { formatDayHeader, groupByDay } from "./JournalList.js";

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

describe("groupByDay", () => {
  it("groups notes by date portion of createdAt", () => {
    const notes: Note[] = [
      makeNote({ id: "note-1" as Note["id"], createdAt: "2026-02-13T10:00:00Z" }),
      makeNote({ id: "note-2" as Note["id"], createdAt: "2026-02-13T14:00:00Z" }),
      makeNote({ id: "note-3" as Note["id"], createdAt: "2026-02-12T09:00:00Z" }),
    ];

    const groups = groupByDay(notes);
    expect(groups.size).toBe(2);
    expect(groups.get("2026-02-13")?.length).toBe(2);
    expect(groups.get("2026-02-12")?.length).toBe(1);
  });

  it("returns empty map for no notes", () => {
    const groups = groupByDay([]);
    expect(groups.size).toBe(0);
  });

  it("puts each note in exactly one group", () => {
    const notes: Note[] = [
      makeNote({ id: "note-1" as Note["id"], createdAt: "2026-01-01T00:00:00Z" }),
      makeNote({ id: "note-2" as Note["id"], createdAt: "2026-01-02T00:00:00Z" }),
      makeNote({ id: "note-3" as Note["id"], createdAt: "2026-01-03T00:00:00Z" }),
    ];

    const groups = groupByDay(notes);
    expect(groups.size).toBe(3);

    let totalNotes = 0;
    for (const dayNotes of groups.values()) {
      totalNotes += dayNotes.length;
    }
    expect(totalNotes).toBe(3);
  });
});

describe("formatDayHeader", () => {
  it("formats a date string as a readable day header", () => {
    const result = formatDayHeader("2026-02-13");
    // Should contain the month and day at minimum
    expect(result).toContain("February");
    expect(result).toContain("13");
    expect(result).toContain("2026");
  });

  it("includes the weekday", () => {
    // 2026-02-13 is a Friday
    const result = formatDayHeader("2026-02-13");
    expect(result).toContain("Friday");
  });
});
