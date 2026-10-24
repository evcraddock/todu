import { type ReactNode, useEffect, useId, useRef } from "react";
import { Icon } from "./Icon.js";

export function ProviderConnectionDialog({
  title,
  pending,
  onClose,
  children,
}: {
  title: string;
  pending: boolean;
  onClose(): void;
  children: ReactNode;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialogRef.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    const dialog = dialogRef.current;
    const active = document.activeElement as HTMLElement | null;
    if (dialog && pending && (active?.matches(":disabled") || !dialog.contains(active))) {
      (
        dialog.querySelector<HTMLElement>("button:not([disabled]), input:not([disabled])") ?? dialog
      ).focus();
    }
  }, [pending]);
  return (
    <div
      className="dialog-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          if (!pending) onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        className="dialog settings-provider-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const controls = [
            ...event.currentTarget.querySelectorAll<HTMLElement>(
              'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]',
            ),
          ];
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (!first) {
            event.preventDefault();
            event.currentTarget.focus();
          } else if (document.activeElement === event.currentTarget) {
            event.preventDefault();
            (event.shiftKey ? last : first).focus();
          } else if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        <div className="settings-key-header">
          <h3 className="dialog-title" id={titleId}>
            {title}
          </h3>
          <button
            type="button"
            className="btn btn-sm btn-with-icon"
            disabled={pending}
            onClick={onClose}
          >
            <Icon name="cancel" />
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
