import type { Note, NoteFilter } from "@todu/core/browser";
import { type ReactNode, useMemo, useState } from "react";
import { useNotes } from "../hooks/useTodu.js";

// ============================================================================
// Types
// ============================================================================

interface JournalListProps {
  onCreateEntry: () => void;
  onViewEntry: (note: Note) => void;
}

// ============================================================================
// Helpers
// ============================================================================

/** Group notes by date (YYYY-MM-DD) */
export function groupByDay(notes: Note[]): Map<string, Note[]> {
  const groups = new Map<string, Note[]>();
  for (const note of notes) {
    const day = note.createdAt.slice(0, 10);
    const existing = groups.get(day);
    if (existing) {
      existing.push(note);
    } else {
      groups.set(day, [note]);
    }
  }
  return groups;
}

/** Format a date string as a human-readable day header */
export function formatDayHeader(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function shiftMonth(date: Date, delta: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1));
}

export function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export function monthRangeFilter(date: Date): NoteFilter {
  const monthStart = startOfMonth(date);
  const monthEnd = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));

  return {
    journal: true,
    createdFrom: monthStart.toISOString().slice(0, 10),
    createdTo: monthEnd.toISOString().slice(0, 10),
  };
}

// ============================================================================
// JournalList
// ============================================================================

export function JournalList({ onCreateEntry, onViewEntry }: JournalListProps): ReactNode {
  const currentMonth = useMemo(() => startOfMonth(new Date()), []);
  const [filterTag, setFilterTag] = useState("");
  const [visibleMonth, setVisibleMonth] = useState<Date>(currentMonth);

  const filter = useMemo(() => monthRangeFilter(visibleMonth), [visibleMonth]);
  const { data: journalNotes, isLoading, isError, error } = useNotes(filter);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    for (const note of journalNotes ?? []) {
      for (const tag of note.tags) tags.add(tag);
    }
    return Array.from(tags).sort();
  }, [journalNotes]);

  const visibleNotes = useMemo(
    () =>
      filterTag
        ? (journalNotes ?? []).filter((n) => n.tags.includes(filterTag))
        : (journalNotes ?? []),
    [journalNotes, filterTag],
  );

  const dayGroups = useMemo(() => groupByDay(visibleNotes), [visibleNotes]);
  const isCurrentMonth = visibleMonth.getTime() === currentMonth.getTime();

  if (isLoading) {
    return (
      <div className="view-container">
        <div className="view-header">
          <h2 className="view-title">Journal</h2>
        </div>
        <div className="loading-state">Loading journal…</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="view-container">
        <div className="view-header">
          <h2 className="view-title">Journal</h2>
        </div>
        <div className="error-state">
          <p>Failed to load journal</p>
          <p className="error-detail">{error instanceof Error ? error.message : "Unknown error"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="view-container">
      <div className="view-header">
        <h2 className="view-title">Journal</h2>
        <button type="button" className="btn btn-primary" onClick={onCreateEntry}>
          + Journal
        </button>
      </div>

      <div className="filter-bar">
        <div className="filter-row">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setVisibleMonth((month) => shiftMonth(month, -1));
              setFilterTag("");
            }}
          >
            ← Older
          </button>
          <span>{formatMonthLabel(visibleMonth)}</span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setVisibleMonth((month) => shiftMonth(month, 1));
              setFilterTag("");
            }}
            disabled={isCurrentMonth}
          >
            Newer →
          </button>
          <select
            className="filter-select"
            value={filterTag}
            onChange={(e) => setFilterTag(e.target.value)}
          >
            <option value="">All tags</option>
            {allTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </div>
      </div>

      {visibleNotes.length === 0 ? (
        <div className="empty-state">
          <p>No journal entries found for {formatMonthLabel(visibleMonth)}</p>
        </div>
      ) : (
        <div className="journal-entries">
          {Array.from(dayGroups.entries()).map(([day, dayNotes]) => (
            <div key={day} className="journal-day-group">
              <h3 className="journal-day-header">{formatDayHeader(day)}</h3>
              {dayNotes.map((note) => (
                <button
                  key={note.id}
                  type="button"
                  className="journal-entry-row"
                  onClick={() => onViewEntry(note)}
                >
                  <span className="journal-entry-time">{note.createdAt.slice(11, 16)}</span>
                  {note.tags.length > 0 && (
                    <div className="label-chips">
                      {note.tags.map((tag) => (
                        <span key={tag} className="chip chip-label">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
