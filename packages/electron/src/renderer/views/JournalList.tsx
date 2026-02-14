import type { Note } from "@todu/core/browser";
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

// ============================================================================
// JournalList
// ============================================================================

export function JournalList({ onCreateEntry, onViewEntry }: JournalListProps): ReactNode {
  const [filterTag, setFilterTag] = useState("");

  // Always fetch all notes (unfiltered) so we can derive the full tag list
  const { data: allNotes, isLoading, isError, error } = useNotes({});

  // Filter to standalone notes only (no entityType)
  const allStandaloneNotes = useMemo(
    () => allNotes?.filter((n) => !n.entityType) ?? [],
    [allNotes],
  );

  // Collect all tags from ALL standalone notes (not filtered subset)
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    for (const note of allStandaloneNotes) {
      for (const tag of note.tags) tags.add(tag);
    }
    return Array.from(tags).sort();
  }, [allStandaloneNotes]);

  // Apply tag filter client-side
  const standaloneNotes = useMemo(
    () =>
      filterTag ? allStandaloneNotes.filter((n) => n.tags.includes(filterTag)) : allStandaloneNotes,
    [allStandaloneNotes, filterTag],
  );

  // Group by day (already sorted newest first from engine)
  const dayGroups = useMemo(() => groupByDay(standaloneNotes), [standaloneNotes]);

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

      {standaloneNotes.length === 0 ? (
        <div className="empty-state">
          <p>No journal entries found</p>
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
