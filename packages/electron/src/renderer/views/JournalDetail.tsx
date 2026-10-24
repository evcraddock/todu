import type { Note } from "@todu/core/browser";
import type { ReactNode } from "react";
import { EntityIdCopy } from "../components/EntityIdCopy.js";
import { EntityTimestamps } from "../components/EntityTimestamps.js";
import { MarkdownEditor } from "../components/MarkdownEditor.js";
import { formatJournalEntryDate, formatJournalEntryTime } from "../lib/journal-time.js";

interface JournalDetailProps {
  note: Note;
  timezone: string;
  onBack: () => void;
  onEdit: (note: Note) => void;
}

export function JournalDetail({ note, timezone, onBack, onEdit }: JournalDetailProps): ReactNode {
  const dateLabel = formatJournalEntryDate(note.createdAt, timezone);
  const timeLabel = formatJournalEntryTime(note.createdAt, timezone);

  return (
    <div className="view-container entity-detail-view journal-detail">
      <div className="detail-page-header">
        <div className="detail-toolbar">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onBack}>
            ← Journal
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onEdit(note)}>
            <span aria-hidden="true">✎</span> Edit entry
          </button>
        </div>

        <div className="journal-detail-header">
          <h2 className="journal-detail-date">{dateLabel}</h2>
          <span className="journal-detail-time">
            {timeLabel} · {timezone}
          </span>
        </div>
      </div>
      <div className="detail-page-content">
        {note.tags.length > 0 && (
          <div className="journal-detail-tags">
            <span className="detail-meta-label">Tags</span>
            <div className="label-chips">
              {note.tags.map((tag) => (
                <span key={tag} className="chip chip-label">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        <section
          className="journal-detail-content journal-content-panel"
          aria-label="Journal entry"
        >
          <MarkdownEditor value={note.content} editable={false} minHeight={200} />
        </section>
      </div>

      <div className="detail-meta">
        <EntityTimestamps
          createdAt={note.createdAt}
          updatedAt={note.updatedAt}
          timezone={timezone}
        />
        <EntityIdCopy id={note.id} entityName="journal entry" />
      </div>
    </div>
  );
}
