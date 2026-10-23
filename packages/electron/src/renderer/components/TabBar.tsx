import type { ReactNode } from "react";

// ============================================================================
// Types
// ============================================================================

export interface Tab {
  id: string;
  label: string;
}

export interface TabBarProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  actions?: ReactNode;
}

// ============================================================================
// TabBar
// ============================================================================

export function TabBar({ tabs, activeTab, onTabChange, actions }: TabBarProps): ReactNode {
  return (
    <div className="tab-bar">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`tab-bar-item ${activeTab === tab.id ? "tab-bar-item-active" : ""}`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
      {actions && <div className="tab-bar-actions">{actions}</div>}
    </div>
  );
}
