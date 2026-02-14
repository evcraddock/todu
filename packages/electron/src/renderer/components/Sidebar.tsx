import type { ReactNode } from "react";
import type { SidebarMode } from "../hooks/useSidebar.js";

export interface NavItem {
  id: string;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "tasks", label: "Tasks", icon: "☐" },
  { id: "projects", label: "Projects", icon: "▦" },
  { id: "habits", label: "Habits", icon: "🔥" },
  { id: "recurring", label: "Recurring", icon: "↻" },
  { id: "notes", label: "Notes", icon: "✎" },
  { id: "labels", label: "Labels", icon: "●" },
];

interface SidebarProps {
  activeView: string;
  onNavigate: (viewId: string) => void;
  mode: SidebarMode;
  cssWidth: number;
  onToggleCollapse: () => void;
  onDragStart: (e: React.MouseEvent) => void;
}

export function Sidebar({
  activeView,
  onNavigate,
  mode,
  cssWidth,
  onToggleCollapse,
  onDragStart,
}: SidebarProps): ReactNode {
  if (mode === "hidden") return null;

  const collapsed = mode === "collapsed";

  return (
    <nav
      className={`sidebar ${collapsed ? "sidebar-collapsed" : ""}`}
      style={{ width: cssWidth, minWidth: cssWidth }}
    >
      <div className="sidebar-header">
        {!collapsed && <h1 className="sidebar-title">todu</h1>}
        <button
          type="button"
          className="btn-icon sidebar-collapse-btn"
          onClick={onToggleCollapse}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? "»" : "«"}
        </button>
      </div>

      <ul className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={`sidebar-nav-item ${activeView === item.id ? "active" : ""}`}
              onClick={() => onNavigate(item.id)}
              title={collapsed ? item.label : undefined}
            >
              <span className="sidebar-nav-icon">{item.icon}</span>
              {!collapsed && <span className="sidebar-nav-label">{item.label}</span>}
            </button>
          </li>
        ))}
      </ul>

      <div className="sidebar-footer">
        <button
          type="button"
          className={`sidebar-nav-item ${activeView === "agent" ? "active" : ""}`}
          onClick={() => onNavigate("agent")}
          title={collapsed ? "Agent" : undefined}
        >
          <span className="sidebar-nav-icon">💬</span>
          {!collapsed && <span className="sidebar-nav-label">Agent</span>}
        </button>
        <button
          type="button"
          className={`sidebar-nav-item ${activeView === "settings" ? "active" : ""}`}
          onClick={() => onNavigate("settings")}
          title={collapsed ? "Settings" : undefined}
        >
          <span className="sidebar-nav-icon">⚙</span>
          {!collapsed && <span className="sidebar-nav-label">Settings</span>}
        </button>
      </div>

      {/* Drag handle — only when expanded */}
      {!collapsed && (
        <div
          className="sidebar-resize-handle"
          onMouseDown={onDragStart}
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-label="Resize sidebar"
        />
      )}
    </nav>
  );
}
