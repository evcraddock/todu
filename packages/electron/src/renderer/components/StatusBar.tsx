import type { ReactNode } from "react";
import { Icon } from "./Icon.js";

export function StatusBar(): ReactNode {
  return (
    <footer className="status-bar">
      <span className="status-indicator">
        <Icon name="local" size={14} /> Local
      </span>
    </footer>
  );
}
