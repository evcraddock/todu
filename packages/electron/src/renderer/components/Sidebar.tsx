import type { ReactNode } from "react";

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
}

export function Sidebar({ activeView, onNavigate }: SidebarProps): ReactNode {
  return (
    <nav className="sidebar">
      <div className="sidebar-header">
        <h1 className="sidebar-title">todu</h1>
      </div>

      <ul className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={`sidebar-nav-item ${activeView === item.id ? "active" : ""}`}
              onClick={() => onNavigate(item.id)}
            >
              <span className="sidebar-nav-icon">{item.icon}</span>
              <span className="sidebar-nav-label">{item.label}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="sidebar-footer">
        <button
          type="button"
          className={`sidebar-nav-item ${activeView === "agent" ? "active" : ""}`}
          onClick={() => onNavigate("agent")}
        >
          <span className="sidebar-nav-icon">💬</span>
          <span className="sidebar-nav-label">Agent</span>
        </button>
      </div>
    </nav>
  );
}
