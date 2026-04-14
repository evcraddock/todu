import type { NoteEntityType, NoteFilter, NoteId } from "@todu/core/browser";
import { type ReactNode, useMemo, useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { useActors, useDeleteNote, useNotes, useProjects, useTasks } from "../hooks/useTodu.js";
import { createActorMap, getActorName, getApprovalLabel } from "../lib/actors.js";

export function NoteList({
  onCreateNote,
  onNavigateToEntity,
}: {
  onCreateNote: () => void;
  onNavigateToEntity: (entityType: string, entityId: string) => void;
}): ReactNode {
  const [filterType, setFilterType] = useState<string>("all");
  const [filterTag, setFilterTag] = useState("");

  const filter: NoteFilter = {
    ...(filterType === "standalone"
      ? { journal: true }
      : filterType !== "all"
        ? { entityType: filterType as NoteEntityType }
        : {}),
    ...(filterTag ? { tag: filterTag } : {}),
  };

  const { data: notes, isLoading, isError, error } = useNotes(filter);
  const { data: projects } = useProjects();
  const { data: tasks } = useTasks();
  const { data: actors } = useActors();
  const deleteNote = useDeleteNote();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; preview: string } | null>(null);

  const actorMap = useMemo(() => createActorMap(actors), [actors]);

  // Build entity name lookup
  const entityNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects ?? []) map.set(p.id, p.name);
    for (const t of tasks ?? []) map.set(t.id, t.title);
    return map;
  }, [projects, tasks]);

  // Collect all tags across notes for the filter dropdown
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    for (const note of notes ?? []) {
      for (const tag of note.tags) tags.add(tag);
    }
    return Array.from(tags).sort();
  }, [notes]);

  const displayNotes = notes;

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteNote.mutate(deleteTarget.id as NoteId, {
      onSuccess: () => setDeleteTarget(null),
    });
  };

  const entityLabel = (entityType?: string, entityId?: string): ReactNode => {
    if (!entityType || !entityId) return <span className="empty-hint">Standalone</span>;
    const name = entityNames.get(entityId) ?? entityId.slice(0, 12);
    return (
      <button
        type="button"
        className="entity-link"
        onClick={(e) => {
          e.stopPropagation();
          onNavigateToEntity(entityType, entityId);
        }}
      >
        {entityType}: {name}
      </button>
    );
  };

  if (isLoading) {
    return (
      <div className="view-container">
        <div className="view-header">
          <h2 className="view-title">Notes</h2>
        </div>
        <div className="loading-state">Loading notes…</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="view-container">
        <div className="view-header">
          <h2 className="view-title">Notes</h2>
        </div>
        <div className="error-state">
          <p>Failed to load notes</p>
          <p className="error-detail">{error instanceof Error ? error.message : "Unknown error"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="view-container">
      <div className="view-header">
        <h2 className="view-title">Notes</h2>
        <button type="button" className="btn btn-primary" onClick={onCreateNote}>
          + New Note
        </button>
      </div>

      <div className="filter-bar">
        <div className="filter-row">
          <select
            className="filter-select"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="all">All types</option>
            <option value="standalone">Standalone</option>
            <option value="task">Task comments</option>
            <option value="project">Project comments</option>
            <option value="habit">Habit comments</option>
          </select>
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

      {!displayNotes || displayNotes.length === 0 ? (
        <div className="empty-state">
          <p>No notes found</p>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Author</th>
              <th>Approval</th>
              <th>Content</th>
              <th>Attached To</th>
              <th>Tags</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {displayNotes.map((note) => (
              <tr key={note.id}>
                <td className="cell-date">{note.createdAt.slice(0, 16).replace("T", " ")}</td>
                <td>{getActorName(note.authorActorId, actorMap, note.author)}</td>
                <td>
                  {getApprovalLabel(note.contentApproval) ?? <span className="empty-hint">-</span>}
                </td>
                <td className="cell-content">
                  {note.content.length > 100 ? `${note.content.slice(0, 100)}…` : note.content}
                </td>
                <td>{entityLabel(note.entityType, note.entityId)}</td>
                <td>
                  <div className="label-chips">
                    {note.tags.map((tag) => (
                      <span key={tag} className="chip chip-label">
                        {tag}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="cell-actions">
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() =>
                      setDeleteTarget({
                        id: note.id,
                        preview: note.content.slice(0, 50),
                      })
                    }
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Note"
          message={`Delete note "${deleteTarget.preview}…"? This cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
