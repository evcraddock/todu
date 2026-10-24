import { type ReactNode, useId } from "react";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  pending?: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  pending = false,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): ReactNode {
  const titleId = useId();
  const messageId = useId();
  const cancel = () => {
    if (!pending) onCancel();
  };
  return (
    <div
      className="dialog-overlay"
      onClick={cancel}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          cancel();
        }
      }}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const controls =
            event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not([disabled])");
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
        <h3 className="dialog-title" id={titleId}>
          {title}
        </h3>
        <p className="dialog-message" id={messageId}>
          {message}
        </p>
        {error && (
          <div className="error-state" role="alert">
            {error}
          </div>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={cancel}
            disabled={pending}
            autoFocus
          >
            {cancelLabel}
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={pending}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
