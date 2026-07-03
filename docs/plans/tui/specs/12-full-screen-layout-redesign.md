# Spec 12: Full-Screen Layout Redesign

## Objective

Define the target full-screen TUI layout so subsequent layout implementation tasks can make the terminal UI feel like an application viewport instead of a compact debug/status block.

## Usable Increment

After this spec, the desired TUI layout is documented clearly enough to implement in small follow-up tasks. No runtime behavior changes are required by this spec.

## Scope

Included:

- Define the full-terminal frame and its major regions.
- Define header, body, footer, and route content responsibilities.
- Define route-specific layouts for Tasks, Projects, Data Status, and Help.
- Define responsive behavior for narrow and short terminals.
- Define connected, reconnecting, offline, and startup-failure connection display rules.
- Define visual hierarchy expectations for the redesigned TUI.

Excluded:

- Implementing Ink layout code.
- Changing daemon communication or data fetching behavior.
- Adding new domain features or task actions.
- Releasing or versioning packages.

## Design Principles

- Use the full visible terminal area from `stdout.columns` and `stdout.rows` whenever available.
- Treat the TUI as a viewport with stable regions, not as a stack of debug text.
- Prioritize task content over chrome.
- Keep normal connected-state diagnostics compact.
- Preserve daemon-first behavior: the TUI remains a thin daemon client and must not own durable data.
- Keep the UI keyboard-first and readable over SSH or in low-color terminals.
- Prefer predictable truncation/windowing over layout jumps.

## Full-Screen Frame

The app should render as a full terminal frame sized to the visible terminal viewport.

```text
╭─ Todu ─ Tasks ───────────────────────── Project: All ─ Sync: connected ─╮
│ Tasks                              │ Detail                              │
│ ────────────────────────────────── │ ────────────────────────────────── │
│ > [high] Fix daemon reconnect      │ Fix daemon reconnect                │
│   [med ] Add launch wrapper        │ Status: active   Priority: high     │
│   [low ] Clean task labels         │ Project: todu                       │
│                                    │                                      │
│                                    │ Description                          │
│                                    │ ...                                  │
│                                    │                                      │
│                                    │ Comments                             │
│                                    │ ...                                  │
├──────────────────────────────────────────────────────────────────────────┤
│ 1 Tasks  2 Projects  ? Help   j/k Move   s Start   d Done   c Comment    │
╰──────────────────────────────────────────────────────────────────────────╯
```

The exact border glyphs may change if Ink capabilities or terminal compatibility require a simpler rendering, but the region model should remain stable.

## Region Sizing

| Region | Rows | Responsibility |
|--------|------|----------------|
| Outer frame | `stdout.rows` x `stdout.columns` | Owns the full visible terminal area. |
| Header | 1 row, inside the top border or immediately below it | Shows app name, route, project filter, daemon state, and sync state. |
| Body | Remaining rows after header/footer/borders | Shows route content and consumes all available vertical space. |
| Footer | 1 row, plus border/separator if used | Shows concise context-aware shortcuts and transient action hints. |
| Modal overlay | Uses available center/body space | Shows focused interaction such as comment input or confirmation without destroying underlying route state. |

Minimum expected frame behavior:

- When terminal dimensions are available, root layout uses the full width and height.
- When dimensions are unavailable or invalid, fallback to a safe default such as 80x24.
- Body height is computed from terminal rows minus header/footer/border rows.
- Route components receive or derive body/pane dimensions instead of using fixed visible row counts.

## Header Content

The header should be compact and stable.

Recommended fields:

- `Todu`
- current route label
- active project filter
- daemon connection state
- sync state

Example:

```text
Todu • Tasks                         Project: All • Daemon: connected • Sync: idle
```

Header rules:

- Use truncation when fields do not fit.
- Prefer route and connection state over verbose detail when space is constrained.
- Do not show handshake diagnostics during normal connected operation.
- Show daemon version only if there is enough room or on a diagnostic route.

## Body Content Rules

The body is route-owned and should fill available height.

General rules:

- Loading, empty, and error states render inside the same route body layout when possible.
- Long content is truncated or windowed instead of pushing footer/header off-screen.
- Route-level scroll or window indicators should appear when content is hidden above or below the viewport.
- Selection must remain visible while navigating list routes.

## Footer Content

The footer should be concise and context-aware.

Examples:

```text
Tasks: j/k move  s start  w wait  d done  x cancel  c comment  ? help  q quit
Projects: j/k move  Enter filter  a all projects  ? help  q quit
Comment: Enter submit  Esc cancel
```

Footer rules:

- Keep the footer to one row when possible.
- Prefer shortcuts relevant to the active route or modal.
- The Help screen remains the full keybinding reference.
- On narrow terminals, drop lower-priority bindings before wrapping.

## Route Layouts

### Tasks

The Tasks route should use the body as a full-height two-pane view.

Recommended layout:

```text
│ Tasks (23)                        │ Detail                              │
│ ───────────────────────────────── │ ────────────────────────────────── │
│ > [high] [active] Fix reconnect   │ Fix reconnect                       │
│   [med ] [wait] Write docs        │ Status active   Priority high       │
│   [low ] [active] Clean labels    │ Project todu                        │
│                                   │ Labels #tui #layout                 │
│                                   │                                      │
│                                   │ Description                          │
│                                   │ ...                                  │
│                                   │                                      │
│                                   │ Comments                             │
│                                   │ ...                                  │
```

Requirements:

- Task list pane fills the available body height.
- Detail pane fills the available body height.
- List/detail panes have a visible separator or border.
- Task row count is derived from pane height, not a hardcoded constant.
- Selection remains visible while moving through long task lists.
- Detail content is organized into title, metadata, description, and comments sections.
- Mutating actions remain disabled while the daemon is disconnected or reconnecting.

### Projects

The Projects route should use the body as a full-height two-pane view.

Recommended layout:

```text
│ Projects (4)                      │ Project Detail                      │
│ ───────────────────────────────── │ ────────────────────────────────── │
│ > All projects                    │ All projects                        │
│   todu                            │ Shows tasks from every project.      │
│   Home                            │                                      │
│   Work                            │ Current filter: All projects         │
```

Requirements:

- Project list pane fills the available body height.
- Project detail pane fills the available body height.
- Include the `All projects` option as a first-class row.
- Project row count is derived from pane height.
- Selection remains visible while moving through long project lists.
- Pressing `Enter` filters Tasks by the selected project, and `a` returns to all projects.

### Data Status

The Data Status route should become a diagnostic view inside the full frame instead of a tiny status block.

Recommended content:

- daemon connection summary
- catalog or dataset context when available
- project count
- task count
- sync state
- last event/reconnect status if available in future work

Requirements:

- Uses the body region with clear section headings.
- Shows detailed daemon diagnostics that are intentionally omitted from normal connected routes.
- Keeps actionable error messages visible when diagnostics cannot load.

### Help

The Help route should remain the complete key reference.

Recommended content:

- global navigation shortcuts
- Tasks route shortcuts
- Projects route shortcuts
- modal/confirmation shortcuts
- daemon status meanings if useful

Requirements:

- Uses the full body height.
- Groups shortcuts by context.
- Keeps footer concise, because the body is the detailed reference.

## Connection and Sync Display Rules

Normal connected state:

- Show compact connection state in header/status text.
- Do not render the body block currently represented by `Daemon connected`, `Handshake: daemon.hello OK`, and `Daemon version: ...`.
- Detailed handshake/version information belongs in Data Status or Help/diagnostics content.

Reconnecting or offline after a successful connection:

- Keep cached Tasks and Projects route content visible when available.
- Show reconnecting/offline state in the header/status line and optionally a subtle route-local notice.
- Disable mutations while disconnected or reconnecting.
- Avoid replacing the whole body with reconnect diagnostics if cached route data exists.

Startup failure before any successful connection:

- Render a full-screen actionable error state.
- Include the daemon socket path when useful.
- Include start guidance such as `todu daemon start`.
- Do not show empty Tasks/Projects panes when no daemon-backed data has ever loaded.

Protocol mismatch or unrecoverable daemon error:

- Render a full-screen actionable error state.
- Explain the likely version alignment issue and recommend updating matching packages.

## Responsive Behavior

### Width

Recommended breakpoints:

- Wide terminals: show two-pane Tasks and Projects layouts with generous detail space.
- Medium terminals: keep two panes but truncate list rows and compact metadata labels.
- Narrow terminals: prefer content readability over strict two-pane density. The implementation may collapse detail below list or show one pane at a time if two panes become unreadable.

Minimum expectations:

- No important control text should wrap into unreadable fragments.
- Header and footer should truncate or drop optional fields before wrapping excessively.
- Task titles, project names, descriptions, and comments should truncate predictably.

### Height

Recommended behavior:

- Body height controls visible list rows.
- Very short terminals should preserve header and footer first, then show a minimal route body.
- List panes should show as many rows as fit and indicate hidden rows when possible.
- Detail panes should keep title and metadata visible before description/comments.

Minimum expectations:

- Header and footer remain visible when terminal height is reasonable, such as 12 rows or more.
- Short terminals do not crash or render negative/invalid dimensions.
- Selection remains visible even if only a few list rows fit.

## Visual Hierarchy

Priority order:

1. Current route content.
2. Current selection and detail title.
3. Compact daemon/sync state.
4. Context-aware action hints.
5. Detailed diagnostics.

Color guidance:

- Cyan: app identity, selected route/section headings, active selection when not inverse.
- Gray: secondary metadata and hints.
- Yellow: reconnecting, pending, warning, confirmation.
- Red: errors and unavailable states.
- Green: successful action or healthy ready state.

Do not rely on color alone. Selection should also use a prefix, inverse text, or another non-color cue.

## Suggested Files for Follow-Up Implementation

- `packages/tui/src/components/AppFrame.tsx`
- `packages/tui/src/components/StatusLine.tsx`
- `packages/tui/src/components/HelpBar.tsx`
- `packages/tui/src/components/ConnectionState.tsx`
- `packages/tui/src/screens/TasksScreen.tsx`
- `packages/tui/src/screens/ProjectsScreen.tsx`
- `packages/tui/src/screens/DataStatusScreen.tsx`
- `packages/tui/src/screens/HelpScreen.tsx`
- `packages/tui/src/components/tasks/TaskListPane.tsx`
- `packages/tui/src/components/tasks/TaskDetailPane.tsx`

## Follow-Up Task Mapping

This spec is intended to guide these implementation tasks:

1. Make TUI use full terminal viewport.
2. Replace TUI debug connection block.
3. Add full-height TUI pane layout.
4. Make TUI lists viewport-aware.
5. Redesign TUI task detail hierarchy.
6. Make TUI footer help context-aware.

## Acceptance Criteria

- A layout spec exists under `docs/plans/tui/specs/`.
- The spec describes full-screen region sizing for header, body, and footer.
- The spec describes route-specific layouts for Tasks, Projects, Data Status, and Help.
- The spec defines behavior for small terminal dimensions.
- The spec explicitly removes the always-visible connected handshake block from normal body content.

## Verification Plan

- Run `npm run check:ci`.
- Review the spec for consistency with `docs/plans/tui/architecture.md`.
- Confirm follow-up implementation tasks can reference this spec without requiring additional layout decisions.
