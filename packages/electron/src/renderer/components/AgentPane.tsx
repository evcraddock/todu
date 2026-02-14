import type { ReactNode } from "react";
import { AgentView } from "../views/AgentView.js";

interface AgentPaneProps {
  visible: boolean;
  width: number;
  onDragStart: (e: React.MouseEvent) => void;
  onClose: () => void;
}

export function AgentPane({ visible, width, onDragStart, onClose }: AgentPaneProps): ReactNode {
  if (!visible) return null;

  return (
    <aside className="agent-pane" style={{ width, minWidth: width }}>
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
