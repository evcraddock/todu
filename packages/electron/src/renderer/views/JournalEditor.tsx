import type { Note, NoteId } from "@todu/core/browser";
import { type ReactNode, useCallback, useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { MarkdownEditor } from "../components/MarkdownEditor.js";
import { useCreateNote, useUpdateNote } from "../hooks/useTodu.js";
import { formatJournalEntryDate } from "../lib/journal-time.js";

// ============================================================================
// Types
// ============================================================================

interface JournalEditorProps {
  /** Existing note to edit, or undefined for a new entry */
  note?: Note;
  timezone: string;
  /** Called when the user saves or cancels */
  onClose: () => void;
}

// ============================================================================
// JournalEditor — full-screen writing view
// ============================================================================

export function JournalEditor({ note, timezone, onClose }: JournalEditorProps): ReactNode {
  const [content, setContent] = useState(note?.content ?? "");
  const [tagsInput, setTagsInput] = useState(note?.tags.join(", ") ?? "");
  const [error, setError] = useState("");
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const createNote = useCreateNote();
  const updateNote = useUpdateNote();

  const isEditing = !!note;
  const isPending = createNote.isPending || updateNote.isPending;

  const isDirty = isEditing
    ? content !== note.content || tagsInput !== note.tags.join(", ")
    : content.trim() !== "" || tagsInput.trim() !== "";

  const handleBack = useCallback(() => {
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  const parseTags = (): string[] =>
    tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

  const handleSave = () => {
    if (!content.trim()) {
      setError("Content is required");
      return;
    }
    setError("");

    const tags = parseTags();

    if (isEditing) {
      updateNote.mutate(
        { id: note.id as NoteId, input: { content: content.trim(), tags } },
        {
          onSuccess: onClose,
          onError: (err) => setError(err instanceof Error ? err.message : "Failed to save"),
        },
      );
    } else {
      createNote.mutate(
        { content: content.trim(), tags: tags.length > 0 ? tags : undefined, author: "user" },
        {
          onSuccess: onClose,
          onError: (err) => setError(err instanceof Error ? err.message : "Failed to create"),
        },
      );
    }
  };

  const dateLabel = formatJournalEntryDate(note?.createdAt ?? new Date().toISOString(), timezone);

  return (
    <div className="journal-editor">
      {/* Toolbar */}
      <div className="journal-editor-toolbar">
        <button type="button" className="btn btn-secondary btn-sm" onClick={handleBack}>
          ← Back
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={handleSave}
          disabled={!content.trim() || isPending}
        >
          {isPending ? "Saving…" : "Save"}
        </button>
      </div>

      {/* Date header */}
      <div className="journal-editor-date">{dateLabel}</div>

      {error && <div className="journal-editor-error">{error}</div>}

      {/* Editor */}
      <div className="journal-editor-content">
        <MarkdownEditor
          value={content}
          onChange={setContent}
          placeholder="Write your thoughts…"
          minHeight={400}
          autoFocus
        />
      </div>

      {/* Tags */}
      <div className="journal-editor-tags">
        <label className="form-label" htmlFor="journal-tags">
          Tags
        </label>
        <input
          id="journal-tags"
          className="input"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="tag1, tag2, tag3"
        />
        <span className="form-hint">Comma-separated</span>
      </div>

      {showDiscardConfirm && (
        <ConfirmDialog
          title="Discard changes?"
          message="You have unsaved changes. Discard them and go back?"
          onConfirm={onClose}
          onCancel={() => setShowDiscardConfirm(false)}
        />
      )}
    </div>
  );
}
