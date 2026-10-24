import type { Note } from "@todu/core/browser";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useNotes } from "../hooks/useTodu.js";
import { journalPreview } from "../lib/journal-preview.js";
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
  const [searchText, setSearchText] = useState("");
  const [sort, setSort] = useState("newest");
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

  const visibleNotes = useMemo(() => {
    const query = searchText.trim().toLocaleLowerCase();
    return (journalNotes ?? [])
      .filter(
        (note) =>
          (!filterTag || note.tags.includes(filterTag)) &&
          (!query ||
            journalPreview(note.content).toLocaleLowerCase().includes(query) ||
            note.content.toLocaleLowerCase().includes(query) ||
            note.tags.some((tag) => tag.toLocaleLowerCase().includes(query))),
      )
      .sort((a, b) =>
        sort === "newest"
          ? b.createdAt.localeCompare(a.createdAt)
          : a.createdAt.localeCompare(b.createdAt),
      );
  }, [journalNotes, filterTag, searchText, sort]);

  const dayGroups = useMemo(
    () => groupJournalNotesByDay(visibleNotes, timezone),
    [timezone, visibleNotes],
  );
  const isCurrentWeek = visibleWeek === currentWeek;

  if (isError) {
    return (
      <div className="view-container list-view">
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
    <div className="view-container list-view">
      <div className="view-header">
        <h2 className="view-title">
          Journal <span className="list-count">{visibleNotes.length}</span>
        </h2>
        <button type="button" className="btn btn-primary" onClick={onCreateEntry}>
          + New entry
        </button>
      </div>

      <div className="filter-bar list-filters">
        <input
          type="search"
          className="search-input"
          aria-label="Search journal entries"
          placeholder="Search this week…"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        <div className="filter-row">
          <div className="list-filter-field">
            Week
            <div className="journal-week-controls">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                aria-label="Previous week"
                onClick={() => {
                  setVisibleWeek((week) => shiftWeek(week, -1));
                  setFilterTag("");
                }}
              >
                ←
              </button>
              <span className="journal-week-label">{formatWeekLabel(visibleWeek, timezone)}</span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                aria-label="Next week"
                disabled={isCurrentWeek}
                onClick={() => {
                  setVisibleWeek((week) => shiftWeek(week, 1));
                  setFilterTag("");
                }}
              >
                →
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={isCurrentWeek}
                onClick={() => setVisibleWeek(currentWeek)}
              >
                This week
              </button>
            </div>
          </div>
          <label className="list-filter-field">
            Tag
            <select
              className="filter-select"
              value={filterTag}
              onChange={(e) => setFilterTag(e.target.value)}
            >
              <option value="">All tags</option>
              {[...new Set([...allTags, ...(filterTag ? [filterTag] : [])])].map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-secondary btn-sm list-clear-filters"
            onClick={() => {
              setSearchText("");
              setFilterTag("");
              setVisibleWeek(currentWeek);
            }}
          >
            Clear filters
          </button>
        </div>
      </div>
      <label className="list-sort-control">
        Sort by
        <select className="filter-select" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="newest">Date: newest first</option>
          <option value="oldest">Date: oldest first</option>
        </select>
      </label>

      {isLoading ? (
        <div className="loading-state">Loading journal…</div>
      ) : visibleNotes.length === 0 ? (
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
                  <span className="journal-entry-preview">{journalPreview(note.content)}</span>
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
