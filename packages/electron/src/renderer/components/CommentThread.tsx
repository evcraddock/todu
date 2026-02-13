import { type ReactNode, useState } from "react";
import { useCreateNote, useDeleteNote, useNotes } from "../hooks/useTodu.js";

export function CommentThread({
  entityType,
  entityId,
}: {
  entityType: string;
  entityId: string;
}): ReactNode {
  const { data: notes, isLoading } = useNotes({ entityType, entityId });
  const createNote = useCreateNote();
  const deleteNote = useDeleteNote();
  const [newComment, setNewComment] = useState("");

  const handleSubmit = () => {
    if (!newComment.trim()) return;
    createNote.mutate(
      { content: newComment.trim(), entityType, entityId, author: "user" },
      { onSuccess: () => setNewComment("") },
    );
  };

  return (
    <div className="comment-thread">
      <h3 className="section-title">Comments</h3>
      {isLoading && <div className="loading-state">Loading comments…</div>}
      {notes && notes.length === 0 && <div className="empty-hint">No comments yet</div>}
      {notes?.map((note) => (
        <div key={note.id} className="comment">
          <div className="comment-header">
            <span className="comment-author">{note.author ?? "user"}</span>
            <span className="comment-date">{note.createdAt.slice(0, 16).replace("T", " ")}</span>
            <button
              type="button"
              className="btn-icon"
              title="Delete comment"
              onClick={() => deleteNote.mutate(note.id)}
            >
              ✕
            </button>
          </div>
          <div className="comment-body">{note.content}</div>
        </div>
      ))}
      <div className="comment-input">
        <textarea
          className="input"
          rows={2}
          placeholder="Add a comment…"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
          }}
        />
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={handleSubmit}
          disabled={!newComment.trim() || createNote.isPending}
        >
          Comment
        </button>
      </div>
    </div>
  );
}
