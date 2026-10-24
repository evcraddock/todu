import { type ReactNode, useEffect, useState } from "react";
import { Icon } from "./Icon.js";

interface Toast {
  id: number;
  message: string;
  type: "error" | "success" | "info";
}

let toastId = 0;
const listeners = new Set<(toast: Toast) => void>();

/**
 * Show a toast notification from anywhere in the app.
 */
export function showToast(message: string, type: "error" | "success" | "info" = "info"): void {
  const toast: Toast = { id: ++toastId, message, type };
  for (const listener of listeners) {
    listener(toast);
  }
}

export function ToastContainer(): ReactNode {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const handler = (toast: Toast) => {
      setToasts((prev) => [...prev, toast]);
      // Auto-dismiss after 5 seconds
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, 5000);
    };
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.type}`}>
          <span className="toast-message">{toast.message}</span>
          <button
            type="button"
            className="toast-dismiss btn-with-icon"
            aria-label="Dismiss notification"
            onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
          >
            <Icon name="cancel" />
          </button>
        </div>
      ))}
    </div>
  );
}
