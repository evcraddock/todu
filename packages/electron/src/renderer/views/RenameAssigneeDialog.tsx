import { type ReactNode, useState } from "react";
import { Icon } from "../components/Icon.js";
import { useRenameActor } from "../hooks/useTodu.js";

export function RenameAssigneeDialog({
  actorId,
  currentName,
  onClose,
}: {
  actorId: string;
  currentName: string;
  onClose: () => void;
}): ReactNode {
  const renameActor = useRenameActor();
  const [name, setName] = useState(currentName);
  const pending = renameActor.isPending;
  const close = () => {
    if (!pending) onClose();
  };

  return (
    <div
      className="dialog-overlay"
      onClick={close}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          close();
        }
      }}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-assignee-title"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const controls = [
            ...event.currentTarget.querySelectorAll<HTMLElement>(
              "input:not([disabled]), button:not([disabled]), summary",
            ),
          ].filter(
            (element) => element.tagName === "SUMMARY" || !element.closest("details:not([open])"),
          );
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        <h2 className="dialog-title" id="rename-assignee-title">
          Rename Assignee
        </h2>
        <form
          aria-label="Rename assignee"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim() || name.trim() === currentName || pending) return;
            renameActor.mutate({ id: actorId, displayName: name.trim() }, { onSuccess: onClose });
          }}
        >
          <div className="form-field">
            <label className="form-label" htmlFor="rename-assignee-name">
              Name
            </label>
            <input
              id="rename-assignee-name"
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Assignee name"
              disabled={pending}
              required
              autoFocus
            />
          </div>
          {renameActor.error && (
            <div className="error-state" role="alert">
              {renameActor.error.message}
            </div>
          )}
          <div className="dialog-actions">
            <button
              type="button"
              className="btn btn-secondary btn-with-icon"
              disabled={pending}
              onClick={close}
            >
              <Icon name="cancel" /> Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-with-icon"
              disabled={!name.trim() || name.trim() === currentName || pending}
            >
              <Icon name="save" /> {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
