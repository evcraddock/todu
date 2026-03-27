import type { Note } from "@todu/core/browser";
import type { ReactNode } from "react";
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
    <div className="journal-detail">
      <div className="journal-detail-toolbar">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onBack}>
          ← Back
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => onEdit(note)}>
          Edit
        </button>
      </div>

      <div className="journal-detail-header">
        <h2 className="journal-detail-date">{dateLabel}</h2>
        <span className="journal-detail-time">{timeLabel}</span>
      </div>

      {note.tags.length > 0 && (
        <div className="journal-detail-tags">
          <div className="label-chips">
            {note.tags.map((tag) => (
              <span key={tag} className="chip chip-label">
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="journal-detail-content">
        <MarkdownEditor value={note.content} editable={false} minHeight={200} />
      </div>
    </div>
  );
}
