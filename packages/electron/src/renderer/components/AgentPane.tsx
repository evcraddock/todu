import type { ReactNode } from "react";
import { AgentView } from "../views/AgentView.js";

interface AgentPaneProps {
  visible: boolean;
  width: number;
  isDragging: boolean;
  onDragStart: (e: React.MouseEvent) => void;
  onClose: () => void;
}

export function AgentPane({
  visible,
  width,
  isDragging,
  onDragStart,
  onClose,
}: AgentPaneProps): ReactNode {
  const style: React.CSSProperties = visible
    ? { width, minWidth: width }
    : { width: 0, minWidth: 0, display: "none" };

  const className = ["agent-pane", isDragging ? "agent-pane-dragging" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <aside className={className} style={style}>
      <div
        className="agent-pane-resize-handle"
        onMouseDown={onDragStart}
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label="Resize agent pane"
      />
      <div className="agent-pane-content">
        <AgentView onClose={onClose} />
      </div>
    </aside>
  );
}
