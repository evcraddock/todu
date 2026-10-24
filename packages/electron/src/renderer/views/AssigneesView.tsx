import { type ReactNode, useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { useActors, useSetActorArchived } from "../hooks/useTodu.js";
import { AssigneeDetail } from "./AssigneeDetail.js";
import { CreateAssigneeDialog } from "./CreateAssigneeDialog.js";
import { RenameAssigneeDialog } from "./RenameAssigneeDialog.js";

export function AssigneesView(): ReactNode {
  const { data: actors, isLoading, isError, error } = useActors();
  const setArchived = useSetActorArchived();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [archiving, setArchiving] = useState<{ id: string; name: string } | null>(null);
  const [selectedActorId, setSelectedActorId] = useState<string | null>(null);
  const pending = setArchived.isPending;
  const mutationError = !archiving && setArchived.error;
  const query = search.trim().toLocaleLowerCase();
  const people = (actors ?? [])
    .filter(
      (actor) =>
        (status === "all" || !!actor.archived === (status === "archived")) &&
        (!query || `${actor.displayName} ${actor.id}`.toLocaleLowerCase().includes(query)),
    )
    .sort((a, b) => a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id));

  if (selectedActorId)
    return <AssigneeDetail actorId={selectedActorId} onBack={() => setSelectedActorId(null)} />;

  return (
    <div className="view-container list-view">
      <div className="view-header">
        <h2 className="view-title">
          Assignees <span className="list-count">{people.length}</span>
        </h2>
        <button
          type="button"
          className="btn btn-primary"
          disabled={creating || !!editing || !!archiving || pending}
          onClick={() => {
            setCreating(true);
          }}
        >
          + Add assignee
        </button>
      </div>
      <div className="filter-bar list-filters">
        <input
          type="search"
          className="search-input"
          aria-label="Search assignees"
          placeholder="Search assignees…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="filter-row">
          <label className="list-filter-field">
            Status
            <select
              className="filter-select"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="all">All statuses</option>
            </select>
          </label>
          <button
            type="button"
            className="btn btn-secondary btn-sm list-clear-filters"
            onClick={() => {
              setSearch("");
              setStatus("all");
            }}
          >
            Clear filters
          </button>
        </div>
      </div>
      {mutationError && (
        <div className="error-state" role="alert">
          {mutationError.message}
        </div>
      )}
      {creating && <CreateAssigneeDialog onClose={() => setCreating(false)} />}
      {editing && (
        <RenameAssigneeDialog
          actorId={editing.id}
          currentName={editing.name}
          onClose={() => setEditing(null)}
        />
      )}
      {archiving && (
        <ConfirmDialog
          title="Archive Assignee"
          message={`Archive ${archiving.name}? You can restore this assignee later from the Archived list.`}
          confirmLabel={pending ? "Archiving…" : "Archive assignee"}
          pending={pending}
          error={setArchived.error?.message}
          onCancel={() => {
            setArchiving(null);
            setArchived.reset();
          }}
          onConfirm={() => {
            if (pending) return;
            setArchived.mutate(
              { id: archiving.id, archived: true },
              { onSuccess: () => setArchiving(null) },
            );
          }}
        />
      )}
      {isLoading ? (
        <div className="loading-state">Loading assignees…</div>
      ) : isError ? (
        <div className="error-state" role="alert">
          Failed to load assignees: {error.message}
        </div>
      ) : people.length === 0 ? (
        <div className="empty-state">No assignees match your filters</div>
      ) : (
        <table className="data-table assignees-directory-table" aria-label="Assignees">
          <thead>
            <tr>
              <th>Assignee</th>
              <th>Status</th>
              <th className="assignees-directory-actions-heading">Actions</th>
            </tr>
          </thead>
          <tbody>
            {people.map((actor) => (
              <tr key={actor.id}>
                <td>
                  <div className="assignee-person">
                    <span className="assignee-avatar" aria-hidden="true">
                      {actor.displayName.slice(0, 1).toUpperCase()}
                    </span>
                    <div>
                      <button
                        type="button"
                        className="assignees-directory-person-name assignee-name-link"
                        onClick={() => setSelectedActorId(actor.id)}
                      >
                        {actor.displayName}
                      </button>
                      <span className="assignees-directory-person-id">{actor.id}</span>
                    </div>
                  </div>
                </td>
                <td>
                  <span className={`chip ${actor.archived ? "status-paused" : "status-active"}`}>
                    {actor.archived ? "Archived" : "Active"}
                  </span>
                </td>
                <td className="assignees-directory-actions">
                  <div className="assignees-directory-row-actions">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      aria-label={`Rename ${actor.displayName}`}
                      disabled={pending || !!editing || !!archiving}
                      onClick={() => setEditing({ id: actor.id, name: actor.displayName })}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      aria-label={`${actor.archived ? "Restore" : "Archive"} ${actor.displayName}`}
                      disabled={pending || !!editing || !!archiving}
                      onClick={() => {
                        setArchived.reset();
                        if (actor.archived) {
                          setArchived.mutate({ id: actor.id, archived: false });
                        } else {
                          setArchiving({ id: actor.id, name: actor.displayName });
                        }
                      }}
                    >
                      {actor.archived ? "Restore" : "Archive"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
