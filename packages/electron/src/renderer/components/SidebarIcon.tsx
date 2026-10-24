import type { ReactNode } from "react";

export type SidebarIconName =
  | "home"
  | "tasks"
  | "projects"
  | "habits"
  | "recurring"
  | "journal"
  | "assignees"
  | "agent"
  | "settings"
  | "expand"
  | "collapse";

const shapes: Record<SidebarIconName, ReactNode> = {
  home: (
    <>
      <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-8H9v8H4a1 1 0 0 1-1-1Z" />
    </>
  ),
  tasks: (
    <>
      <path d="m3 6 1.5 1.5L7 5M10 6h11M3 12h3M10 12h11M3 18h3M10 18h11" />
    </>
  ),
  projects: (
    <path d="M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z" />
  ),
  habits: (
    <path d="M12 3c1 4-4 5-4 9 0 1 1 2 2 2 2 0 3-3 3-5 4 3 6 5 6 8a7 7 0 0 1-14-1c0-5 4-9 7-13Z" />
  ),
  recurring: (
    <>
      <path d="M20 8a8 8 0 0 0-14-3L3 8M3 3v5h5M4 16a8 8 0 0 0 14 3l3-3M16 16h5v5" />
    </>
  ),
  journal: (
    <>
      <path d="M5 3h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5V3ZM8 3v18M3 7h3M3 12h3M3 17h3M11 8h6M11 12h6" />
    </>
  ),
  assignees: (
    <>
      <circle cx="12" cy="7" r="4" />
      <path d="M4 21v-2a7 7 0 0 1 7-7h2a7 7 0 0 1 7 7v2" />
    </>
  ),
  agent: (
    <>
      <path d="M21 11a8 8 0 0 1-8 8H7l-4 3V7a4 4 0 0 1 4-4h6" />
      <path d="m18 2 1.2 3.8L23 7l-3.8 1.2L18 12l-1.2-3.8L13 7l3.8-1.2Z" />
    </>
  ),
  settings: (
    <>
      <path d="m10 3-.5 2-2 .9-1.9-.6-2 3.4 1.4 1.4v2.8l-1.4 1.4 2 3.4 1.9-.6 2 .9.5 2h4l.5-2 2-.9 1.9.6 2-3.4-1.4-1.4v-2.8l1.4-1.4-2-3.4-1.9.6-2-.9L14 3Z" />
      <circle cx="12" cy="11.5" r="3" />
    </>
  ),
  expand: <path d="m9 5 7 7-7 7" />,
  collapse: <path d="m15 5-7 7 7 7" />,
};

export function SidebarIcon({ name }: { name: SidebarIconName }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {shapes[name]}
    </svg>
  );
}
