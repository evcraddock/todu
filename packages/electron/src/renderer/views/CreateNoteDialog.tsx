import { type ReactNode, useState } from "react";
import { useCreateNote } from "../hooks/useTodu.js";

export function CreateNoteDialog({ onClose }: { onClose: () => void }): ReactNode {
  const createNote = useCreateNote();
  const [content, setContent] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = () => {
    if (!content.trim()) {
      setError("Content is required");
      return;
    }
    setError("");
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    createNote.mutate(
      {
        content: content.trim(),
        tags: tags.length > 0 ? tags : undefined,
        author: "user",
      },
      {
        onSuccess: onClose,
        onError: (err) => setError(err instanceof Error ? err.message : "Failed to create note"),
      },
    );
  };

  return (
    <div
      className="dialog-overlay"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className="dialog dialog-wide"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={undefined}
      >
        <h3 className="dialog-title">New Journal Note</h3>

        {error && <div className="dialog-error">{error}</div>}

        <div className="form-field">
          <label className="form-label" htmlFor="note-content">
            Content *
          </label>
          <textarea
            id="note-content"
            className="input"
            rows={5}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your note…"
            autoFocus
          />
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="note-tags">
            Tags
          </label>
          <input
            id="note-tags"
            className="input"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="tag1, tag2, tag3"
          />
          <span className="form-hint">Comma-separated</span>
        </div>

        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={!content.trim() || createNote.isPending}
          >
            {createNote.isPending ? "Creating…" : "Create Note"}
          </button>
        </div>
      </div>
    </div>
  );
}
