# TUI Client Architecture

## Status

Draft plan for adding an Ink-based terminal UI client to Todu.

## Context

Todu currently has two user-facing clients:

- `packages/cli` — command-oriented CLI companion.
- `packages/electron` — rich desktop UI.

Both are intended to be thin clients over the local daemon. The TUI should follow the same daemon-first architecture: it must not own Automerge storage or initialize engine persistence directly.

## Goals

- Add a keyboard-first interactive terminal client.
- Reuse Electron product concepts loosely without sharing DOM UI components.
- Keep the TUI thin: all durable state and domain behavior live behind the local daemon.
- Support fast task triage from a terminal or SSH session.
- Build with Ink so the implementation can use React component/state patterns.

## Non-Goals

- Replacing the CLI or Electron app.
- Sharing Electron renderer components directly.
- Adding another local state owner.
- Implementing every Electron view in the first milestone.
- Supporting mouse-first workflows.

## Proposed Package

```text
packages/tui/
  package.json
  tsconfig.json
  tsconfig.build.json
  src/
    index.tsx
    app/
      App.tsx
      App.test.tsx
      keymap.ts
      routes.ts
    daemon/
      connection.ts
      todu-client.ts
      events.ts
    state/
      query-client.ts
      query-keys.ts
      selection.ts
    screens/
      TasksScreen.tsx
      TaskDetailScreen.tsx
      ProjectsScreen.tsx
      HabitsScreen.tsx
      SettingsScreen.tsx
    components/
      AppFrame.tsx
      CommandPalette.tsx
      DetailPane.tsx
      HelpBar.tsx
      ListPane.tsx
      StatusLine.tsx
      TextInputModal.tsx
    formatting/
      markdown.ts
      priority.ts
      status.ts
      truncate.ts
```

The TUI should be a standalone npm-distributed app, similar in shape to `@todu/cli`.

Primary standalone command:

```bash
todu-tui
```

Install path:

```bash
npm install -g @todu/tui
```

The CLI may also expose a convenience wrapper:

```bash
todu tui
```

The wrapper must not be the only distribution path. The TUI should be publishable, installable, and runnable as its own package early so every incremental TUI improvement can ship in an npm version. Initial releases may launch the scaffold UI before daemon-backed screens exist; daemon-backed releases target the same local daemon and user-local dataset.

## High-Level Topology

```text
Ink TUI
  |
  | local daemon protocol over UDS
  v
Todu daemon
  |
  v
engine/core/storage/sync
```

The TUI has the same architectural role as Electron:

- Connect to local daemon.
- Run `daemon.hello`.
- Subscribe to daemon events.
- Fetch data via RPC methods.
- Re-fetch or invalidate cached data after events.
- Surface daemon-unavailable errors with actionable guidance.

## Technology Choices

### UI Framework

Use **Ink**.

Reasons:

- React component model maps well to existing Electron mental model.
- Works in Node without browser/Electron runtime.
- Good fit for keyboard-driven terminal interfaces.
- Easier to test component output than lower-level terminal rendering.

Expected dependencies:

```json
{
  "dependencies": {
    "ink": "^5",
    "react": "^19",
    "@tanstack/react-query": "^5",
    "@todu/core": "*",
    "@todu/daemon": "*",
    "@todu/engine": "*"
  }
}
```

The exact dependency list should be validated during implementation. `@todu/engine` should only be used for shared types/client interfaces if needed, not for local storage ownership.

### Data Fetching

Prefer `@tanstack/react-query` in the TUI as Electron already uses it conceptually.

Benefits:

- Familiar query/mutation model.
- Simple cache invalidation on daemon events.
- Clear loading/error states.
- Allows loose reuse of Electron query key naming and invalidation behavior.

Do not import Electron renderer hooks directly. Instead, create TUI-local hooks or data helpers backed by the daemon client.

## Daemon Client Design

The TUI should share the same daemon protocol semantics as Electron:

- Connect timeout: short and fail-fast.
- Request timeout: bounded.
- Reconnect backoff: `250ms → 500ms → 1s → 2s` cap.
- On reconnect:
  - rerun `daemon.hello`
  - resubscribe to events
  - invalidate/refetch active queries

Implementation options:

1. Extract Electron's daemon connection manager into a shared client package.
2. Copy the minimal connection manager into `packages/tui` first, then extract once Electron/TUI duplication becomes clear.

Preferred staged approach: copy/minimize first to avoid premature abstraction, then extract after both clients stabilize.

Potential future shared package:

```text
packages/client-daemon/
  src/connection-manager.ts
  src/todu-client.ts
  src/events.ts
```

## Relationship to Electron

The TUI should borrow concepts, not components.

Reusable concepts:

- Task list + detail split view.
- Project/sidebar filtering.
- Status/priority chips rendered as compact labels.
- Query keys and invalidation semantics.
- Daemon reconnect behavior.
- Sync status display.
- Create/update flows as mutations.

Do not reuse:

- React DOM components.
- CSS.
- Electron preload/window IPC types.
- Browser persistence helpers unless they are made platform-neutral.

Candidate Electron files to study during implementation:

- `packages/electron/src/renderer/hooks/useTodu.ts`
- `packages/electron/src/renderer/views/TasksView.tsx`
- `packages/electron/src/renderer/views/TaskList.tsx`
- `packages/electron/src/renderer/views/TaskDetail.tsx`
- `packages/electron/src/renderer/components/StatusBar.tsx`
- `packages/electron/src/main/daemon-connection-manager.ts`
- `packages/electron/src/main/daemon-todu-client.ts`

## UX Model

The TUI should be optimized for fast keyboard workflows.

### Initial Layout

```text
┌ Todu ───────────────────────────────────────────────────────┐
│ View: Tasks     Project: All     Filter: Active     Sync: ✓ │
├───────────────────────────────┬─────────────────────────────┤
│ > [high] Fix daemon reconnect │ Fix daemon reconnect        │
│   [med ] Write release notes  │                             │
│   [low ] Clean recurring logs │ Status: active              │
│                               │ Priority: high              │
│                               │ Project: todu               │
│                               │                             │
│                               │ Description                 │
│                               │ ...                         │
├───────────────────────────────┴─────────────────────────────┤
│ ↑↓/jk move  enter open  s start  d done  / search  ? help  q quit │
└──────────────────────────────────────────────────────────────┘
```

### Navigation Principles

- Default screen: active tasks.
- `j/k` and arrow keys move selection in the Tasks list.
- `enter` opens focused detail or toggles pane focus once split-pane task browsing is implemented.
- `/` starts search/filter input once filtering is implemented.
- `:` opens command palette once command execution is implemented.
- `?` opens help.
- `q` backs out or quits from the root screen.
- Mutating shortcuts should show confirmation only for destructive actions.

### Current Shell Keymap

The current TUI implements these global navigation and task-list movement keys:

- `1`: Tasks.
- `2`: Projects.
- `3`: Data Status.
- `?`: Help.
- `q`: Back from Help or quit from a root route.
- `Ctrl+C`: Quit immediately.
- `j` / `Down Arrow`: Move down in the Tasks or Projects list.
- `k` / `Up Arrow`: Move up in the Tasks or Projects list.
- `Enter`: Select the focused project and open Tasks filtered by that project.
- `a`: Clear the project filter and open Tasks for all projects.

### MVP Task Actions

- Start task: set status to `inprogress`.
- Mark waiting: set status to `waiting`.
- Complete task: set status to `done`.
- Cancel task: confirm, then set status to `cancelled`.
- Add comment: open one-line or multiline modal.
- Refresh: manual refetch.

## Screens

### MVP Screens

1. **Tasks**
   - Active/in-progress/waiting task list.
   - Project filter.
   - Search filter.
   - Sort by priority or updated/due date once due dates exist.
   - Selected task detail pane.

2. **Projects**
   - Project list with an `All projects` option.
   - Selected project summary.
   - `Enter` opens Tasks filtered by the focused project.
   - `a` clears the filter and returns to all-project Tasks.
   - The active project filter is shown in the shell status line.

3. **Task detail**
   - Full title, status, priority, project, labels, assignees.
   - Description rendered as terminal markdown where practical.
   - Recent comments/notes.
   - Status/comment actions.

4. **Help / command palette**
   - Discoverable shortcuts.
   - Command execution for less common actions.

5. **Connection/error screen**
   - Shows daemon unavailable, reconnecting, protocol mismatch, or timeout.
   - Gives command guidance such as `todu daemon start`.

### Later Screens

- Habits.
- Recurring templates.
- Journal/notes.
- Approvals.
- Settings/sync diagnostics.
- Actor/assignment management.

## State Management

State falls into three categories.

### Server State

Owned by daemon and fetched through RPC:

- tasks
- projects
- labels
- notes/comments
- habits
- recurring templates
- actors
- sync status

Use React Query for server state.

### UI State

Owned locally by the TUI process:

- current route/screen
- selected list index
- focused pane
- current filter/search text
- open modal/command palette
- transient toast/status messages

Use React component state or small colocated reducers. Avoid global state until there is a demonstrated need.

### Local Preferences

Potential future local preferences:

- default screen
- keymap preset
- compact/comfortable density
- visible columns

For MVP, keep preferences in memory only. Persist later through a shared config path if needed.

## Event and Refresh Strategy

Subscribe to daemon events:

- `data.changed`
- `sync.statusChanged`

On `data.changed`:

- invalidate all domain queries for MVP.
- Later, use payload details for narrower invalidation.

On `sync.statusChanged`:

- update sync status query/cache.
- refresh status line.

On reconnect:

- invalidate all queries.
- refresh current route data.
- show transient `reconnected` status.

On disconnect:

- keep the last rendered data visible if available.
- show status as `offline/reconnecting`.
- disable mutations until reconnected.

## Error Handling

Error behavior should match daemon-first expectations:

- If daemon is unavailable at startup, show a clear blocking screen.
- If daemon disconnects after startup, keep the UI open and reconnect.
- Mutations while disconnected should fail fast with a visible message.
- Protocol mismatch should be explicit and recommend version alignment.
- Validation errors should be shown near the action that caused them.

## Testing Strategy

### Unit Tests

- Formatting helpers.
- Keymap behavior.
- Query key helpers.
- Reducers/selection helpers.

### Component Tests

Use Ink testing utilities where practical:

- task list rendering
- selection movement
- empty states
- error states
- modal input flows

### Integration Tests

Use the daemon test harness or a fake daemon connection:

- startup hello flow
- task list fetch
- status mutation
- event-driven invalidation
- reconnect/resubscribe behavior

## Build and Workspace Integration

Root scripts should eventually include:

```json
{
  "scripts": {
    "build:tui": "npm run --workspace=packages/tui build"
  }
}
```

The root `build` and `typecheck` scripts can include TUI once the package is stable enough not to slow unrelated work significantly.

## Milestones

### Milestone 1: Vertical Slice

Deliverable:

- `packages/tui` compiles.
- `todu tui` or `todu-tui` launches.
- Connects to daemon.
- Lists active tasks.
- Shows selected task details.
- Lists projects.
- Filters tasks by selected project.
- Supports selection movement.
- Shows connection/sync status.

Success criteria:

- No direct engine/storage ownership.
- Works against a running local daemon.
- Fails clearly when daemon is unavailable.

### Milestone 2: Task Triage

Deliverable:

- Status changes: start, waiting, done, cancel.
- Add comment.
- Search/filter.
- Manual refresh.
- Event-driven refresh.

Success criteria:

- TUI can handle a normal terminal task-triage session.
- Reconnect preserves current selection where possible.

### Milestone 3: Broader Domain Coverage

Deliverable:

- Project create/update flows if not already included.
- Habit list/check-in.
- Notes/journal read path.
- Recurring templates read path.

Success criteria:

- TUI is useful beyond task triage while remaining keyboard-first.

### Milestone 4: Polish

Deliverable:

- Command palette.
- Configurable keymap.
- Better markdown rendering.
- Loading/empty/error state refinement.
- Accessibility pass for low-color terminals.

### Milestone 5: Standalone NPM Release

Deliverable:

- Publishable `@todu/tui` package metadata.
- Standalone `todu-tui` binary.
- `npm pack --workspace=@todu/tui` verification.
- Release workflow publishes `@todu/tui` alongside other npm packages.
- README install, compatibility, and incremental-release guidance.
- Optional `todu tui` wrapper if CLI integration remains useful.

## Open Questions

- Should the daemon connection manager be extracted before or after the first TUI vertical slice?
- How much terminal markdown rendering is enough for task descriptions/comments?
- Should task creation be in the MVP or deferred until triage is solid?
- Should the TUI support an embedded agent pane later, mirroring Electron's agent view?
