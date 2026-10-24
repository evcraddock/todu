import type { NoteId } from "@todu/core/browser";
import { type ReactNode, useMemo, useState } from "react";
import {
  useActors,
  useApproveNoteContent,
  useCreateNote,
  useDeleteNote,
  useNotes,
  useUpdateNote,
} from "../hooks/useTodu.js";
import { createActorMap, getActorName, getApprovalLabel } from "../lib/actors.js";
import { Icon } from "./Icon.js";
import { MarkdownEditor } from "./MarkdownEditor.js";

export function CommentThread({
  entityType,
  entityId,
  composerOpen,
  onComposerOpenChange,
}: {
  entityType: string;
  entityId: string;
  composerOpen?: boolean;
  onComposerOpenChange?: (open: boolean) => void;
}): ReactNode {
  const { data: notes, isLoading } = useNotes({ entityType, entityId });
  const { data: actors } = useActors();
  const createNote = useCreateNote();
  const deleteNote = useDeleteNote();
  const updateNote = useUpdateNote();
  const approveNoteContent = useApproveNoteContent();
  const [newComment, setNewComment] = useState("");
  const [localComposerOpen, setLocalComposerOpen] = useState(false);
  const showComposer = composerOpen ?? localComposerOpen;
  const setShowComposer = onComposerOpenChange ?? setLocalComposerOpen;
  const [editingComment, setEditingComment] = useState<{ id: NoteId; content: string } | null>(
    null,
  );
  const [editError, setEditError] = useState("");
  const [approvalMessage, setApprovalMessage] = useState("");
  const actorMap = useMemo(() => createActorMap(actors), [actors]);

  const handleSubmit = () => {
    if (!newComment.trim() || createNote.isPending) return;
    createNote.mutate(
      { content: newComment.trim(), entityType, entityId },
      {
        onSuccess: () => {
          setNewComment("");
          setShowComposer(false);
        },
      },
    );
  };

  const saveComment = () => {
    if (!editingComment?.content.trim() || updateNote.isPending) return;
    setEditError("");
    updateNote.mutate(
      { id: editingComment.id, input: { content: editingComment.content.trim() } },
      {
        onSuccess: () => setEditingComment(null),
        onError: (err) =>
          setEditError(err instanceof Error ? err.message : "Failed to save comment"),
      },
    );
  };

  return (
    <div className="comment-thread">
      {composerOpen === undefined && (
        <div className="comment-thread-heading">
          <h3 className="section-title">Comments</h3>
          {!showComposer && composerOpen === undefined && (
            <button
              type="button"
              className="btn btn-primary btn-sm btn-with-icon"
              onClick={() => setShowComposer(true)}
            >
              <Icon name="add" /> Add Comment
            </button>
          )}
        </div>
      )}
      {showComposer && (
        <div
          className="comment-input"
          role="group"
          aria-label="New comment"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        >
          <MarkdownEditor
            value={newComment}
            onChange={setNewComment}
            placeholder="Add a comment…"
            minHeight={160}
            autoFocus
            editable={!createNote.isPending}
          />
          {createNote.error && (
            <div className="error-state" role="alert">
              {createNote.error.message}
            </div>
          )}
          <div className="comment-edit-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm btn-with-icon"
              onClick={handleSubmit}
              disabled={!newComment.trim() || createNote.isPending}
            >
              <Icon name="save" /> Comment
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm btn-with-icon"
              disabled={createNote.isPending}
              onClick={() => {
                setNewComment("");
                setShowComposer(false);
              }}
            >
              <Icon name="cancel" /> Cancel
            </button>
          </div>
        </div>
      )}
      {approvalMessage && <div className="settings-hint">{approvalMessage}</div>}
      {isLoading && <div className="loading-state">Loading comments…</div>}
      {notes && notes.length === 0 && <div className="empty-hint">No comments yet</div>}
      {notes?.map((note) => {
        const isEditing = editingComment?.id === note.id;
        const approvalLabel = getApprovalLabel(note.contentApproval);
        return (
          <div key={note.id} className="comment">
            <div className="comment-header">
              <span className="comment-author">
                {getActorName(note.authorActorId, actorMap, note.author)}
              </span>
              {approvalLabel && <span className="chip chip-label">{approvalLabel}</span>}
              {note.contentApproval?.state === "pendingApproval" && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm btn-with-icon"
                  onClick={() =>
                    approveNoteContent.mutate(note.id, {
                      onSuccess: () => setApprovalMessage("Comment approved."),
                      onError: (err) =>
                        setApprovalMessage(
                          err instanceof Error ? err.message : "Failed to approve comment",
                        ),
                    })
                  }
                  disabled={approveNoteContent.isPending || isEditing}
                >
                  <Icon name="check" />
                  {approveNoteContent.isPending ? "Approving…" : "Approve"}
                </button>
              )}
              <span className="comment-date">{note.createdAt.slice(0, 16).replace("T", " ")}</span>
              {!isEditing && (
                <button
                  type="button"
                  className="btn-icon"
                  title="Edit comment"
                  aria-label="Edit comment"
                  disabled={editingComment !== null || updateNote.isPending}
                  onClick={() => {
                    setEditingComment({ id: note.id, content: note.content });
                    setEditError("");
                  }}
                >
                  <Icon name="edit" />
                </button>
              )}
              <button
                type="button"
                className="btn-icon"
                title="Delete comment"
                aria-label="Delete comment"
                disabled={isEditing || updateNote.isPending}
                onClick={() => deleteNote.mutate(note.id)}
              >
                <Icon name="delete" />
              </button>
            </div>
            <div className="comment-body">
              {isEditing ? (
                <div
                  className="comment-edit"
                  role="group"
                  aria-label="Edit comment"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      saveComment();
                    }
                  }}
                >
                  <MarkdownEditor
                    value={editingComment.content}
                    onChange={(content) =>
                      setEditingComment((current) => (current ? { ...current, content } : null))
                    }
                    minHeight={160}
                    autoFocus
                    editable={!updateNote.isPending}
                  />
                  {editError && (
                    <div className="error-state" role="alert">
                      {editError}
                    </div>
                  )}
                  <div className="comment-edit-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm btn-with-icon"
                      disabled={!editingComment.content.trim() || updateNote.isPending}
                      onClick={saveComment}
                    >
                      <Icon name="save" />
                      {updateNote.isPending ? "Saving…" : "Save comment"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm btn-with-icon"
                      disabled={updateNote.isPending}
                      onClick={() => {
                        setEditingComment(null);
                        setEditError("");
                      }}
                    >
                      <Icon name="cancel" /> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <MarkdownEditor value={note.content} editable={false} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
