import type { Note } from "@todu/core/browser";
import type { ReactNode } from "react";
import { MarkdownEditor } from "../components/MarkdownEditor.js";

interface JournalDetailProps {
  note: Note;
  onBack: () => void;
  onEdit: (note: Note) => void;
}

export function JournalDetail({ note, onBack, onEdit }: JournalDetailProps): ReactNode {
  const dateLabel = new Date(note.createdAt).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const timeLabel = note.createdAt.slice(11, 16);

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
