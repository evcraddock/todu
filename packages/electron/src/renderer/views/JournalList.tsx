import type { Note } from "@todu/core/browser";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useNotes } from "../hooks/useTodu.js";
import {
  currentWeekStart,
  formatJournalDayLabel,
  formatJournalEntryTime,
  formatWeekLabel,
  groupJournalNotesByDay,
  shiftWeek,
  weekRangeFilter,
} from "../lib/journal-time.js";

// ============================================================================
// Types
// ============================================================================

interface JournalListProps {
  timezone: string;
  onCreateEntry: () => void;
  onViewEntry: (note: Note) => void;
}

// ============================================================================
// JournalList
// ============================================================================

export function JournalList({ timezone, onCreateEntry, onViewEntry }: JournalListProps): ReactNode {
  const currentWeek = useMemo(() => currentWeekStart(timezone), [timezone]);
  const [filterTag, setFilterTag] = useState("");
  const [visibleWeek, setVisibleWeek] = useState(currentWeek);

  useEffect(() => {
    setVisibleWeek(currentWeek);
    setFilterTag("");
  }, [currentWeek]);

  const filter = useMemo(() => weekRangeFilter(visibleWeek, timezone), [timezone, visibleWeek]);
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

  const dayGroups = useMemo(
    () => groupJournalNotesByDay(visibleNotes, timezone),
    [timezone, visibleNotes],
  );
  const isCurrentWeek = visibleWeek === currentWeek;

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
              setVisibleWeek((week) => shiftWeek(week, -1));
              setFilterTag("");
            }}
          >
            ← Older
          </button>
          <span>{formatWeekLabel(visibleWeek, timezone)}</span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setVisibleWeek((week) => shiftWeek(week, 1));
              setFilterTag("");
            }}
            disabled={isCurrentWeek}
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
          <p>No journal entries found for {formatWeekLabel(visibleWeek, timezone)}</p>
        </div>
      ) : (
        <div className="journal-entries">
          {Array.from(dayGroups.entries()).map(([day, dayNotes]) => (
            <div key={day} className="journal-day-group">
              <h3 className="journal-day-header">{formatJournalDayLabel(day, timezone)}</h3>
              {dayNotes.map((note) => (
                <button
                  key={note.id}
                  type="button"
                  className="journal-entry-row"
                  onClick={() => onViewEntry(note)}
                >
                  <span className="journal-entry-time">
                    {formatJournalEntryTime(note.createdAt, timezone)}
                  </span>
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
