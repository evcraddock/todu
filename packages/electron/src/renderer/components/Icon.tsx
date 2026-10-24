import type { ReactNode } from "react";

export type IconName =
  | "home"
  | "overview"
  | "tasks"
  | "projects"
  | "habits"
  | "recurring"
  | "journal"
  | "assignees"
  | "agent"
  | "settings"
  | "progress"
  | "calendar"
  | "week"
  | "waiting"
  | "square"
  | "checked-square"
  | "chart"
  | "trend"
  | "edit"
  | "add"
  | "back"
  | "forward"
  | "delete"
  | "archive"
  | "restore"
  | "save"
  | "cancel"
  | "clear-filters"
  | "check"
  | "warning"
  | "error"
  | "copy"
  | "connect"
  | "disconnect"
  | "server"
  | "send"
  | "stop"
  | "up"
  | "down"
  | "local"
  | "bold"
  | "italic"
  | "strike"
  | "heading1"
  | "heading2"
  | "heading3"
  | "list"
  | "ordered-list"
  | "code"
  | "link"
  | "rule"
  | "expand"
  | "collapse";

const shapes: Record<IconName, ReactNode> = {
  overview: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
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
  progress: <path d="m8 4 12 8-12 8Z" />,
  square: <rect x="4" y="4" width="16" height="16" rx="2" />,
  chart: <path d="M4 3v18h17M9 17v-5M14 17V8M19 17V4" />,
  trend: <path d="m3 17 6-6 4 4 8-10M15 5h6v6" />,
  add: <path d="M12 4v16M4 12h16" />,
  back: <path d="M20 12H4m7-7-7 7 7 7" />,
  forward: <path d="M4 12h16m-7-7 7 7-7 7" />,
  delete: (
    <>
      <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
    </>
  ),
  archive: (
    <>
      <rect x="3" y="3" width="18" height="4" rx="1" />
      <path d="M5 7v14h14V7M10 11h4" />
    </>
  ),
  restore: (
    <>
      <path d="M3 10a9 9 0 1 1 2 9M3 4v6h6M12 7v5l3 2" />
    </>
  ),
  save: (
    <>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2ZM7 3v6h10V3M7 21v-8h10v8" />
    </>
  ),
  cancel: <path d="m6 6 12 12M6 18 18 6" />,
  "clear-filters": <path d="M3 4h18l-7 8v4l-4 5v-9ZM16 17l5 5M21 17l-5 5" />,
  check: <path d="m4 12 5 5L20 6" />,
  warning: (
    <>
      <path d="m12 3 10 18H2ZM12 9v5M12 17h.01" />
    </>
  ),
  error: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m9 9 6 6M9 15l6-6" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
  connect: (
    <>
      <path d="m8 12-3 3a4 4 0 0 0 6 6l3-3M16 12l3-3a4 4 0 0 0-6-6l-3 3M8 16l8-8" />
    </>
  ),
  disconnect: (
    <path d="m3 3 18 18M8 12l-3 3a4 4 0 0 0 6 6l2-2M16 12l3-3a4 4 0 0 0-6-6l-2 2M3 9h3M9 3v3M18 15h3M15 18v3" />
  ),
  server: (
    <>
      <rect x="3" y="3" width="18" height="7" rx="2" />
      <rect x="3" y="14" width="18" height="7" rx="2" />
      <path d="M7 6.5h.01M7 17.5h.01" />
    </>
  ),
  send: <path d="m22 2-7 20-4-9-9-4ZM22 2 11 13" />,
  stop: <rect x="5" y="5" width="14" height="14" rx="1" />,
  up: <path d="M12 20V4m-7 7 7-7 7 7" />,
  down: <path d="M12 4v16m-7-7 7 7 7-7" />,
  local: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  bold: <path d="M6 3h7a4.5 4.5 0 0 1 0 9H6Zm0 9h8a4.5 4.5 0 0 1 0 9H6Z" />,
  italic: <path d="M10 3h10M4 21h10M15 3 9 21" />,
  strike: <path d="M18 5c-2-3-11-3-11 2 0 2 2 3 5 4M6 19c3 3 11 3 11-2 0-2-2-3-5-4M3 12h18" />,
  heading1: <path d="M3 4v16M13 4v16M3 12h10M17 13l3-2v9" />,
  heading2: <path d="M3 4v16M13 4v16M3 12h10M17 13c0-3 5-3 5 0 0 2-5 4-5 7h5" />,
  heading3: <path d="M3 4v16M13 4v16M3 12h10M17 11h5l-3 4c5-1 4 6-2 5" />,
  list: <path d="M4 6h.01M4 12h.01M4 18h.01M9 6h12M9 12h12M9 18h12" />,
  "ordered-list": (
    <path d="M3 4h1v6M2 10h4M2 15c0-3 4-3 4 0 0 2-4 3-4 6h4M10 6h11M10 12h11M10 18h11" />
  ),
  code: <path d="m8 6-6 6 6 6M16 6l6 6-6 6M14 3l-4 18" />,
  link: (
    <>
      <path d="m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" />
    </>
  ),
  rule: <path d="M3 12h18" />,
  edit: (
    <>
      <path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14Z" />
    </>
  ),
  "checked-square": (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 11h18" />
    </>
  ),
  week: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 11h18M7 15h10M7 18h6" />
    </>
  ),
  waiting: (
    <>
      <path d="M6 3h12M6 21h12M7 3v4c0 2 3 3 5 5-2 2-5 3-5 5v4M17 3v4c0 2-3 3-5 5 2 2 5 3 5 5v4" />
    </>
  ),
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="app-icon"
      width={size}
      height={size}
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
