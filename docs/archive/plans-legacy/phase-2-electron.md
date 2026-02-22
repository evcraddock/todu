# Phase 2: Electron App

> Planning document for the Electron desktop application with embedded AI agent.

## Approach

Same vertical slice strategy as Phase 1. Each slice delivers a manually testable feature end-to-end. No horizontal layers — every task produces something you can see and use.

## Prerequisites

- Phase 1 complete (384 tests, all features working via CLI)
- ARCHITECTURE.md updated with IPC design, process model, reactivity pattern

## Slice Breakdown

Seven slices, roughly in dependency order. Slices 3-5 can be done in any order once Slice 2 is complete.

```
Slice 1: Foundation ──► Slice 2: Tasks ──┬──► Slice 3: Projects + Labels
                                         ├──► Slice 4: Habits
                                         ├──► Slice 5: Recurring + Notes
                                         └──► Slice 6: Agent ──► Slice 7: Polish
```

---

## Slice 1: Electron Foundation

**Goal:** Electron app launches, renders a React UI, communicates with the engine via IPC. One working view (project list) proves the full stack.

### Deliverables

- Electron + React + TypeScript project scaffold in `packages/electron/`
- Main process: creates `BrowserWindow`, initializes engine via `createTodu()`
- Preload script: `contextBridge.exposeInMainWorld('todu', { ... })`
- IPC bridge: typed `window.todu` API mirroring engine SDK namespaces
- IPC handlers in main process wrapping engine SDK calls
- Change notification: main pushes `todu:data:changed` events to renderer on catalog/doc changes
- React app shell: sidebar navigation + content area layout
- One working view: project list (fetched via IPC, rendered in React)
- Build pipeline: dev mode with hot reload, production build
- Window management: size/position persistence across restarts

### Technical Decisions to Make

- **Build tool**: electron-forge vs electron-builder vs electron-vite
- **React bundling**: Vite (likely, since it supports React HMR and Electron well)
- **Component library**: Evaluate during implementation (shadcn/ui, Radix, plain Tailwind, etc.)
- **State management**: Start with React Query (TanStack Query) for IPC data fetching + cache invalidation on change notifications. No global store unless complexity demands it.

### IPC Bridge Design

The preload script creates a typed API object. Each namespace maps to `ipcRenderer.invoke()` calls:

```
window.todu = {
  project: {
    list:   ()           => ipcRenderer.invoke('todu:project:list'),
    get:    (id)         => ipcRenderer.invoke('todu:project:get', id),
    create: (input)      => ipcRenderer.invoke('todu:project:create', input),
    update: (id, input)  => ipcRenderer.invoke('todu:project:update', id, input),
    delete: (id)         => ipcRenderer.invoke('todu:project:delete', id),
  },
  task: { ... },
  label: { ... },
  note: { ... },
  recurring: { ... },
  habit: { ... },
  agent: {
    send:    (message)   => ipcRenderer.invoke('todu:agent:send', message),
    abort:   ()          => ipcRenderer.invoke('todu:agent:abort'),
  },
  on: (channel, callback) => ipcRenderer.on(channel, callback),
  off: (channel, callback) => ipcRenderer.removeListener(channel, callback),
}
```

Main process registers handlers:

```
// Auto-generate from SDK namespace — one handler per operation
for (const [ns, methods] of Object.entries(toduNamespaces)) {
  for (const [method, fn] of Object.entries(methods)) {
    ipcMain.handle(`todu:${ns}:${method}`, (_, ...args) => fn(...args));
  }
}
```

### Change Notifications

When the main process detects data changes (Automerge doc change events), it pushes to the renderer:

```
catalog.on('change', () => {
  mainWindow.webContents.send('todu:data:changed', { type: 'catalog' });
});
```

The renderer's React Query setup listens and invalidates relevant queries:

```
ipcRenderer.on('todu:data:changed', () => queryClient.invalidateQueries());
```

Coarse-grained invalidation is fine for a single-user app. Optimize later if needed.

### App Layout

```
┌──────────────────────────────────────────────┐
│  todu                                   - □ x │
├──────────┬───────────────────────────────────┤
│          │                                   │
│ ■ Tasks  │     [Content Area]                │
│   Projects│                                  │
│   Habits │                                   │
│   Recur. │                                   │
│   Notes  │                                   │
│   Labels │                                   │
│          │                                   │
│──────────│                                   │
│ 💬 Agent │                                   │
│          │                                   │
├──────────┴───────────────────────────────────┤
│  Status: ● Local                             │
└──────────────────────────────────────────────┘
```

### Acceptance Criteria

- [ ] `npm run dev` in `packages/electron/` launches Electron window with React UI
- [ ] Sidebar navigation renders with all section links
- [ ] Project list view loads data via IPC and renders
- [ ] Creating a project via CLI shows up in Electron after refresh/notification
- [ ] Window size/position persists across app restart
- [ ] `npm run build` produces a packaged app
- [ ] Engine errors (Result.ok === false) display in the UI, not silent failures

### Dependencies

- Phase 1 complete (engine SDK, all namespaces)

---

## Slice 2: Task Management Views

**Goal:** Full task management in the GUI — the core use case. List, detail, create, edit, filter, status changes.

### Deliverables

- Task list view: table with columns (title, status, priority, project, due date, labels)
- Column sorting (click header to sort)
- Filter bar: status (multi-select), priority, project, label, overdue/today toggles
- Task detail panel: all fields editable inline or via form
- Create task dialog/form: title (required), project, priority, description, labels, due date
- Status shortcuts: buttons/chips for quick status transitions (start, done, cancel)
- Task search: search input that queries `todu.task.search()`
- Move task: change project from detail view
- Delete with confirmation dialog
- Comment thread on task detail: shows entity-attached notes (entityType=task), inline "add comment" input, delete comment

### Acceptance Criteria

- [ ] Task list shows all tasks across projects (or filtered by project from sidebar)
- [ ] Clicking a task opens detail panel/view
- [ ] Can create a task and see it appear in the list immediately
- [ ] Can edit title, description, priority, labels, due date, status from detail view
- [ ] Filter by status, priority, project, label works
- [ ] Overdue tasks visually highlighted
- [ ] Search finds tasks by title
- [ ] Can move task between projects
- [ ] Delete shows confirmation, removes from list
- [ ] Status transition errors shown (e.g., can't go from done to inprogress)
- [ ] Task detail shows comment thread (entity-attached notes)
- [ ] Can add a comment from task detail view
- [ ] Can delete a comment from task detail view

### Dependencies

- Slice 1 (Electron foundation + IPC)

---

## Slice 3: Project + Label Views

**Goal:** Manage projects and labels from the GUI. Project detail shows its tasks.

### Deliverables

- Project list view: name, status, priority, task count
- Project detail view: project info + filtered task list for that project
- Comment thread on project detail: entity-attached notes (entityType=project), inline add/delete
- Create/edit project form: name, description, priority
- Project status management (active, done, canceled)
- Delete project with warning if it has tasks
- Label list view: name, color swatch, usage count
- Create/edit label form: name, color picker
- Delete label with cascade info (removes from tasks)

### Acceptance Criteria

- [ ] Project list shows all projects with task counts
- [ ] Project detail shows tasks belonging to that project (reuses task list component)
- [ ] Project detail shows comment thread (entity-attached notes)
- [ ] Can add and delete comments from project detail
- [ ] Can create, edit, delete projects
- [ ] Label list shows all labels with color swatches
- [ ] Can create label with color picker
- [ ] Can edit and delete labels
- [ ] Deleting a label shows how many tasks will be affected

### Dependencies

- Slice 2 (task list component to reuse in project detail)

---

## Slice 4: Habit Views

**Goal:** Track habits from the GUI. Check in, view streaks, see history.

### Deliverables

- Habit list view: title, schedule, streak (🔥), today's status (✅/—), next due
- Habit detail view: full info + streak stats + history
- Comment thread on habit detail: entity-attached notes (entityType=habit), inline add/delete
- Check/uncheck toggle: one-click check-in from list or detail view
- History visualization: calendar-style grid or simple date list showing completed/missed
- Create/edit habit form: title, schedule (RRULE with presets), timezone, start date
- Pause/resume toggle
- Streak display: current, longest, total check-ins

### Schedule Presets

Instead of raw RRULE input, offer presets with custom option:

| Preset | RRULE |
|--------|-------|
| Daily | `FREQ=DAILY` |
| Weekdays | `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR` |
| Mon/Wed/Fri | `FREQ=WEEKLY;BYDAY=MO,WE,FR` |
| Weekly (pick day) | `FREQ=WEEKLY;BYDAY=<selected>` |
| Custom | Raw RRULE input |

### Acceptance Criteria

- [ ] Habit list shows all habits with streak and today's status
- [ ] One-click check-in toggles today's status
- [ ] Streak updates immediately after check-in
- [ ] History view shows last 30 days with completion status
- [ ] Can create habit with schedule preset or custom RRULE
- [ ] Can pause/resume habits
- [ ] Can edit and delete habits
- [ ] Habit detail shows comment thread (entity-attached notes)
- [ ] Can add and delete comments from habit detail

### Dependencies

- Slice 1 (Electron foundation + IPC)

---

## Slice 5: Recurring Templates + Notes Views

**Goal:** Manage recurring templates and notes from the GUI.

### Deliverables

**Recurring Templates:**

- Template list view: title, schedule (human-readable), project, next due, status (active/paused)
- Template detail view: full info + upcoming occurrences
- Create/edit form: title, schedule (presets + custom RRULE), project, priority, labels, timezone, start/end dates
- Pause/resume toggle
- Generate button: early materialization for a selected future date
- Upcoming view: projected occurrences for next N days (read-only, no tasks created)

**Notes:**

The Notes sidebar view is for browsing and creating standalone journal entries. Entity-attached notes (comments on tasks/projects/habits) are created and displayed inline in each entity's detail view (Slices 2-4). This view provides:

- Notes list view: content preview, author, date, entity attachment info, tags
- Filter: by entity type (all/standalone/task/project/habit), by tag
- Create standalone journal note: content, tags
- Delete note with confirmation
- Clicking an entity-attached note navigates to that entity's detail view

### Acceptance Criteria

- [ ] Recurring template list shows all templates with human-readable schedules
- [ ] Can create, edit, delete, pause/resume templates
- [ ] Upcoming view shows projected future occurrences
- [ ] Generate creates a task for a future date
- [ ] Notes list shows all notes with filtering by type and tag
- [ ] Can create standalone journal notes from the Notes view
- [ ] Can delete notes
- [ ] Clicking an entity-attached note navigates to the parent entity

### Dependencies

- Slice 1 (Electron foundation + IPC)

---

## Slice 6: AI Agent Integration

**Goal:** Embedded planning agent in the Electron app. Chat panel with streaming responses, tool calls visible inline.

### Deliverables

- Agent setup in main process: `pi-agent-core` Agent class with `pi-ai` streaming
- Todu tool definitions: TypeBox parameter schemas wrapping each engine SDK operation
- Agent system prompt: todu-specific instructions (available tools, data model awareness, planning focus)
- Chat panel UI: message list (user + assistant + tool calls), input box, send button
- Streaming display: assistant text streams in real-time as chunks arrive
- Tool call display: inline cards showing tool name, parameters, result (e.g., "✅ Created task: Fix login bug")
- Abort button: cancel in-progress agent responses
- Model selection: dropdown to pick provider/model (stored in config)
- API key configuration: settings UI for entering provider API keys

### Agent Tools

Each engine SDK operation becomes an AgentTool. Tools use TypeBox schemas for parameter validation.

| Tool | Maps to | Description |
|------|---------|-------------|
| `list_projects` | `todu.project.list()` | List all projects |
| `create_project` | `todu.project.create(input)` | Create a project |
| `list_tasks` | `todu.task.list(filter, sort)` | List/filter tasks |
| `create_task` | `todu.task.create(input)` | Create a task |
| `update_task` | `todu.task.update(id, input)` | Update task fields |
| `search_tasks` | `todu.task.search(query)` | Search tasks by title |
| `list_habits` | `todu.habit.list()` | List habits with status |
| `check_habit` | `todu.habit.check(id)` | Check in for today |
| `habit_streak` | `todu.habit.streak(id)` | Get streak info |
| `list_recurring` | `todu.recurring.list()` | List recurring templates |
| `create_note` | `todu.note.create(input)` | Add a note |
| ... | ... | One tool per useful SDK operation |

Not every SDK operation needs a tool. Focus on what's useful for planning:
- **Include**: list, create, update, search, check habit, streak, upcoming
- **Skip initially**: delete operations (too destructive for agent), low-level ops

### Agent Events → UI

The Agent class emits `AgentEvent` objects. The main process forwards these to the renderer:

```
agent.on('event', (event) => {
  mainWindow.webContents.send('todu:agent:event', event);
});
```

The chat panel renders based on event types:
- `message_start` → new message bubble
- `message_update` → append streaming text
- `tool_execution_start` → show "calling tool..." card
- `tool_execution_end` → show tool result in card
- `agent_end` → mark response complete

### Acceptance Criteria

- [ ] Agent chat panel visible in sidebar or split view
- [ ] Can type a message and get a streaming response
- [ ] Tool calls shown inline with name + result
- [ ] Agent can list tasks, create tasks, check habits (via tools)
- [ ] Data changes from agent tool calls refresh the UI views
- [ ] Can abort an in-progress response
- [ ] Can select model from settings
- [ ] API key entry in settings
- [ ] Agent errors displayed in chat (not silent failures)

### Dependencies

- Slice 1 (Electron foundation + IPC)
- Slices 2-5 recommended (so agent tool calls have views to refresh)

---

## Slice 7: System Tray + Polish

**Goal:** System tray integration, packaging, and UX polish.

### Deliverables

- System tray icon with context menu
- Tray menu: show/hide window, quick create task, due today count, quit
- Minimize to tray (configurable: close button = quit vs minimize)
- App icon (all platforms)
- Keyboard shortcuts: global shortcut to show/hide, Cmd/Ctrl+N for new task
- Loading states: skeleton/spinner while IPC calls are in-flight
- Empty states: helpful messages when no tasks/projects/habits exist
- Error handling: toast/notification system for operation failures
- Production build: signed, packaged app for macOS (primary), Linux
- `make dev-electron` and `make build-electron` Makefile targets

### Tray Menu

```
┌─────────────────────────┐
│ ✓ Show todu             │
│ ─────────────────────── │
│ + New Task...           │
│ ─────────────────────── │
│ 📋 3 tasks due today   │
│ 🔥 2 habits to check   │
│ ─────────────────────── │
│ ✕ Quit                 │
└─────────────────────────┘
```

### Acceptance Criteria

- [ ] Tray icon appears when app is running
- [ ] Click tray icon toggles window visibility
- [ ] Right-click shows context menu
- [ ] "New Task" opens quick create in the app
- [ ] Due today count is accurate
- [ ] Minimize to tray works
- [ ] Close button behavior is configurable (quit vs tray)
- [ ] App has proper icon on macOS/Linux
- [ ] `make build-electron` produces a distributable package
- [ ] All views have loading and empty states

### Dependencies

- Slices 1-6 (all views implemented)

---

## Open Questions

Decisions to make before or during implementation:

1. **Component library** — shadcn/ui? Radix + Tailwind? Plain CSS? Evaluate during Slice 1 based on what feels productive.

2. **Electron build tool** — electron-forge vs electron-vite. electron-vite is newer and integrates Vite natively, which simplifies React HMR. electron-forge is more mature. Evaluate during Slice 1.

3. **Binary name coexistence** — Currently `toduai` is the CLI. Should launching the Electron app be `toduai --gui`, a separate `toduai-app` binary, or just double-click the packaged app? The CLI and Electron share the engine but are separate packages.

4. **Agent conversation persistence** — Should chat history persist across app restarts? If so, store in a new Automerge document or local file? Start without persistence, add later if needed.

5. **Dark mode** — Follow system theme? Toggle in settings? Design for dark-first since most dev tools are dark.

6. **Habit history visualization** — Simple date list vs calendar grid vs GitHub-contribution-style heatmap. Start simple, enhance later.

## Estimated Scope

Based on Phase 1 pacing (each slice took 1-2 sessions):

| Slice | Estimated Effort | Notes |
|-------|-----------------|-------|
| 1: Foundation | Large | Most setup, biggest unknown (Electron tooling) |
| 2: Tasks | Large | Most complex views, filtering, editing |
| 3: Projects + Labels | Medium | Simpler CRUD, reuses task list |
| 4: Habits | Medium | Unique UI (streaks, check-in, history) |
| 5: Recurring + Notes | Medium | Two features but both are straightforward |
| 6: Agent | Large | New dependency (pi-ai), streaming UI, tools |
| 7: Polish | Medium | Tray, packaging, UX cleanup |
