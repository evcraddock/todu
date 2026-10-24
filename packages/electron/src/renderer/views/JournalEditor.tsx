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
  const [editingTags, setEditingTags] = useState(false);
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

  const parseTags = (): string[] => [
    ...new Set(
      tagsInput
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ];

  const handleSave = () => {
    if (isPending) return;
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
        { content: content.trim(), tags: tags.length > 0 ? tags : undefined },
        {
          onSuccess: onClose,
          onError: (err) => setError(err instanceof Error ? err.message : "Failed to create"),
        },
      );
    }
  };

  const dateLabel = formatJournalEntryDate(note?.createdAt ?? new Date().toISOString(), timezone);

  return (
    <div className="view-container entity-detail-view journal-editor">
      {/* Toolbar */}
      <div className="detail-toolbar">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={handleBack}
          disabled={isPending}
        >
          ← Journal
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={handleSave}
          disabled={!content.trim() || isPending}
        >
          {isPending ? "Saving…" : "Save entry"}
        </button>
      </div>

      {/* Date header */}
      <div className="journal-editor-heading">
        <h2 className="view-title">{isEditing ? "Edit journal entry" : "New journal entry"}</h2>
        <p className="detail-property-hint">
          {dateLabel} · {timezone}
        </p>
      </div>

      {error && (
        <div className="journal-editor-error" role="alert">
          {error}
        </div>
      )}

      {/* Editor */}
      <div className="journal-editor-content journal-content-panel">
        <MarkdownEditor
          value={content}
          onChange={setContent}
          placeholder="Write your thoughts…"
          minHeight={400}
          autoFocus
          editable={!isPending}
        />
      </div>

      {editingTags ? (
        <section className="journal-tag-editor" aria-label="Edit entry tags">
          <label className="list-filter-field" htmlFor="journal-tags">
            Tags
            <input
              id="journal-tags"
              className="input"
              value={tagsInput}
              disabled={isPending}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="e.g. reflection, ideas"
            />
            <span className="detail-property-hint">Separate tags with commas.</span>
          </label>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setEditingTags(false)}
          >
            Done
          </button>
        </section>
      ) : (
        <div className="journal-tag-summary">
          {parseTags().length > 0 && (
            <>
              <span className="detail-meta-label">Tags</span>
              <div className="label-chips">
                {parseTags().map((tag) => (
                  <span key={tag} className="chip chip-label">
                    {tag}
                  </span>
                ))}
              </div>
            </>
          )}
          <button
            type="button"
            className="btn btn-sm task-label-edit"
            disabled={isPending}
            onClick={() => setEditingTags(true)}
          >
            <span aria-hidden="true">{parseTags().length ? "✎" : "+"}</span>{" "}
            {parseTags().length ? "Edit tags" : "Add tags"}
          </button>
        </div>
      )}

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
