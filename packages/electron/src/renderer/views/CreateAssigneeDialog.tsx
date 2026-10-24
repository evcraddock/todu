import { createActorId } from "@todu/core/browser";
import { type ReactNode, useState } from "react";
import { useCreateActor } from "../hooks/useTodu.js";

export function CreateAssigneeDialog({ onClose }: { onClose: () => void }): ReactNode {
  const createActor = useCreateActor();
  const [name, setName] = useState("");
  const [customId, setCustomId] = useState("");
  const pending = createActor.isPending;
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
        aria-labelledby="new-assignee-title"
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
        <h2 className="dialog-title" id="new-assignee-title">
          New Assignee
        </h2>
        <form
          aria-label="Add assignee"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim() || pending) return;
            createActor.mutate(
              {
                id: createActorId(customId.trim() || `actor-${crypto.randomUUID().slice(0, 8)}`),
                displayName: name.trim(),
              },
              { onSuccess: onClose },
            );
          }}
        >
          <div className="form-field">
            <label className="form-label" htmlFor="new-assignee-name">
              Name
            </label>
            <input
              id="new-assignee-name"
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Assignee name"
              disabled={pending}
              required
              autoFocus
            />
          </div>
          <details className="assignee-custom-id">
            <summary>Custom identifier (optional)</summary>
            <div className="form-field">
              <label className="form-label" htmlFor="new-assignee-id">
                ID
              </label>
              <input
                id="new-assignee-id"
                className="input"
                value={customId}
                onChange={(event) => setCustomId(event.target.value)}
                placeholder="Generated automatically"
                disabled={pending}
              />
            </div>
          </details>
          {createActor.error && (
            <div className="error-state" role="alert">
              {createActor.error.message}
            </div>
          )}
          <div className="dialog-actions">
            <button type="button" className="btn btn-secondary" disabled={pending} onClick={close}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={!name.trim() || pending}>
              {pending ? "Adding…" : "Add assignee"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
