import type { ReactNode } from "react";

export function StatusBar(): ReactNode {
  return (
    <footer className="status-bar">
      <span className="status-indicator">● Local</span>
    </footer>
  );
}
