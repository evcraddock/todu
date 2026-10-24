import type { ReactNode } from "react";
import type { SidebarMode } from "../hooks/useSidebar.js";
import { SidebarIcon, type SidebarIconName } from "./SidebarIcon.js";

export interface NavItem {
  id: string;
  label: string;
  icon: SidebarIconName;
}

const NAV_ITEMS: NavItem[] = [
  { id: "home", label: "Home", icon: "home" },
  { id: "tasks", label: "Tasks", icon: "tasks" },
  { id: "projects", label: "Projects", icon: "projects" },
  { id: "habits", label: "Habits", icon: "habits" },
  { id: "recurring", label: "Recurring Tasks", icon: "recurring" },
  { id: "journal", label: "Journal", icon: "journal" },
  { id: "assignees", label: "Assignees", icon: "assignees" },
];

interface SidebarProps {
  activeView: string;
  onNavigate: (viewId: string) => void;
  mode: SidebarMode;
  cssWidth: number;
  onToggleCollapse: () => void;
  onDragStart: (e: React.MouseEvent) => void;
  agentPaneVisible: boolean;
  onToggleAgentPane: () => void;
}

export function Sidebar({
  activeView,
  onNavigate,
  mode,
  cssWidth,
  onToggleCollapse,
  onDragStart,
  agentPaneVisible,
  onToggleAgentPane,
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
          <SidebarIcon name={collapsed ? "expand" : "collapse"} />
        </button>
      </div>

      <ul className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={`sidebar-nav-item ${activeView === item.id ? "active" : ""}`}
              onClick={() => onNavigate(item.id)}
              aria-label={item.label}
              title={collapsed ? item.label : undefined}
            >
              <span className="sidebar-nav-icon">
                <SidebarIcon name={item.icon} />
              </span>
              {!collapsed && <span className="sidebar-nav-label">{item.label}</span>}
            </button>
          </li>
        ))}
      </ul>

      <div className="sidebar-footer">
        <button
          type="button"
          className={`sidebar-nav-item ${agentPaneVisible ? "active" : ""}`}
          onClick={onToggleAgentPane}
          aria-label="Agent"
          title={collapsed ? "Agent (⌘J)" : undefined}
        >
          <span className="sidebar-nav-icon">
            <SidebarIcon name="agent" />
          </span>
          {!collapsed && <span className="sidebar-nav-label">Agent</span>}
        </button>
        <button
          type="button"
          className={`sidebar-nav-item ${activeView === "settings" ? "active" : ""}`}
          onClick={() => onNavigate("settings")}
          aria-label="Settings"
          title={collapsed ? "Settings" : undefined}
        >
          <span className="sidebar-nav-icon">
            <SidebarIcon name="settings" />
          </span>
          {!collapsed && <span className="sidebar-nav-label">Settings</span>}
        </button>
      </div>

      {/* Drag handle — only when expanded */}
      {!collapsed && (
        <div
          className="sidebar-resize-handle"
          onMouseDown={onDragStart}
          onDoubleClick={onToggleCollapse}
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-label="Resize sidebar"
        />
      )}
    </nav>
  );
}
