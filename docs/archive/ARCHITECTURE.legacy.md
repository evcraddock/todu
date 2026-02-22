# todu Architecture

> Local-first task management with offline support, AI-powered planning, and seamless sync

This document describes the architecture for todu, a rewrite of [todu-api](https://github.com/evcraddock/todu-api) and [todu.sh](https://github.com/evcraddock/todu.sh) with a local-first approach. It replaces the Go CLI + Go API server + PostgreSQL stack with a TypeScript monorepo using Automerge for local-first storage and sync.

## Vision

A task management system that:

- **Works offline** — Full functionality without internet
- **Syncs seamlessly** — Changes merge automatically across devices via Automerge
- **Plans with AI** — Embedded agent for organizing, planning, and reasoning about work
- **Extends via plugins** — Todu extension system for integrations, imports, exports
- **Integrates with coding agents** — Pi extension for terminal-based coding workflows
- **Runs anywhere** — Desktop GUI (Electron) and terminal CLI

### The Brain/Hands Split

todu separates **planning** from **doing**:

- **Brain (Electron app)** — AI agent for planning, organizing, and reasoning about tasks. Uses todu tools only — no file system access. "What should I work on next?" "Break this feature into tasks." "Summarize what I accomplished this week."
- **Hands (pi in terminal)** — Full coding agent with todu extension for actual work. Reads task context, writes code, runs tests, records what was done.

Both share the same engine and data via Automerge. The Electron agent is intentionally constrained — no read/write/bash/edit tools. If we later want coding-agent capabilities in Electron, we can add those tools, but that's a bigger decision. For now, coding happens in an actual terminal.

During Phase 1 (CLI-only), there is no planning agent. Task management is manual via CLI commands. The agent arrives in Phase 2 with Electron.

## Package Structure

```
@todu/core                        # Types, schema, validation (no deps)
     ↓
@todu/engine                      # SDK, Automerge, CRUD, sync, extensions
     ↓
@todu/cli                         # Terminal interface (thin, engine only)
@todu/electron                    # Desktop GUI + AI agent (engine + pi-ai + pi-agent-core)

todu-pi-extension                 # Separate repo: pi extension for terminal use
todu-github                       # Separate repo: GitHub Issues sync
todu-forgejo                      # Separate repo: Forgejo Issues sync
```

This mirrors pi-mono's layered approach:

| pi-mono | todu | Role |
|---------|------|------|
| `ai` | — | (no LLM streaming equivalent in core) |
| `agent` | `@todu/engine` | Core operations, no UI |
| `coding-agent` | `@todu/cli` | Product with terminal interface |
| `mom` | `@todu/electron` | Same engine, different UI |
| — | `todu-pi-extension` | Lighter integration into pi |

### Package Responsibilities

| Package | Dependencies | Responsibility |
|---------|-------------|----------------|
| `@todu/core` | None | Types, branded IDs (TaskId, ProjectId, LabelId, NoteId, HabitId, RecurringId), status/priority enums, type guards, Automerge document schema, validation functions, `Result<T, E>` type, shared constants, scheduling utilities (RRULE validation, deterministic ID generation) |
| `@todu/engine` | `core`, `automerge` | `createTodu()` SDK, Automerge doc management (create, open, save), storage abstraction, CRUD operations, queries (filter, sort, search), sync client, config, todu extension system |
| `@todu/cli` | `engine` | Arg parsing, command routing, output formatting (table/JSON), exit codes |
| `@todu/electron` | `engine`, `pi-ai`, `pi-agent-core` | Desktop GUI, AI agent for planning, system tray, notifications |
| `todu-pi-extension` | `engine` | Registers todu tools in pi for terminal coding workflows |
| `todu-github` | `engine` | Bidirectional sync with GitHub Issues (todu extension) |
| `todu-forgejo` | `engine` | Bidirectional sync with Forgejo Issues (todu extension) |

### Design Principles

- **SDK-first** — The engine exposes a programmatic API (`createTodu(config) → Todu`). CLI and Electron are thin consumers. No backdoors — everything goes through the SDK.
- **Bottom-up dependencies** — Each layer has zero knowledge of the layer above it. The engine doesn't know about CLI or Electron. Core doesn't know about Automerge runtime.
- **No business logic in UI layers** — CLI parses args, calls engine, formats output. Electron renders views and wires the agent. All logic lives in the engine.
- **Automerge lives in engine** — Core only defines schema types. Engine owns all Automerge runtime concerns (doc management, storage, sync protocol).
- **Sync lives in engine** — CLI triggers sync explicitly. Electron syncs in background. Same engine code either way.
- **Config lives in engine** — Shared by all consumers. CLI and Electron don't have their own config systems.

## The Engine SDK

The engine is the central package. All consumers interact with todu through `createTodu(config)`, which returns a `Todu` instance with namespaced operations:

| Namespace | Operations |
|-----------|-----------|
| `todu.project` | create, list, get, update, delete |
| `todu.task` | create, list, get, update, delete, move, search |
| `todu.label` | create, list, update, delete |
| `todu.note` | create, list, delete |
| `todu.recurring` | create, list, get, update, delete, pause, resume, upcoming, generate, process |
| `todu.habit` | create, list, get, update, delete, pause, resume, check, uncheck, streak, history |
| `todu.sync` | start, stop, status |
| `todu.config` | get |

All mutation/query operations return `Result<T>` (success or typed error). The CLI, Electron, and pi extension all go through this same interface.

The CLI is extremely thin: parse args → call engine → format output → exit code. No business logic whatsoever.

## Local-First with Automerge

All data is stored locally using [Automerge](https://automerge.org/) CRDTs (Conflict-free Replicated Data Types).

**Benefits:**

- Works completely offline
- No server required for basic operations
- Automatic conflict resolution when syncing
- Data sovereignty — your tasks stay on your machine

**Storage location:** `~/.config/toduai/data/` (default), configurable via `--config` flag or `TODUAI_DATA_DIR` env var.

**Automerge packages used:**

- `@automerge/automerge-repo` — Core document management
- `@automerge/automerge-repo-storage-nodefs` — Filesystem persistence
- `@automerge/automerge-repo-network-websocket` — Sync server connection

## Data Model

### Core Entities

| Entity | Key Fields | Notes |
|--------|-----------|-------|
| **Project** | id, name, description, status, priority, externalId, systemId, syncStrategy | syncStrategy: bidirectional, pull, push, none. Statuses: active, done, canceled. |
| **Task** | id, title, status, priority, projectId, labels[], dueDate, scheduledDate, externalId, sourceUrl, templateId, createdAt, updatedAt | Description stored separately in TaskDetailDocument. Priority: high, medium, low. |
| **Label** | id, name, color | Shared across all projects. Unique names enforced. |
| **Note** | id, content, author, entityType?, entityId?, tags[], createdAt | Generalized notes — standalone (journal) or entity-attached (task, project, habit). Immutable (create + delete only). |
| **RecurringTemplate** | id, title, description, projectId, labels[], priority, schedule (RRULE), timezone, startDate, endDate?, nextDue, skippedDates[], paused | Generates normal tasks with deterministic IDs. Catch-up generates all missed. Skip list prevents deleted task resurrection. |
| **Habit** | id, title, description, schedule (RRULE), timezone, startDate, endDate?, nextDue, paused, createdAt, updatedAt | Tracks consistency via check-ins, not task generation. Streaks computed from HabitLogDocument (not stored). Only current date is active — missed dates are implicit failures. |
| **HabitEntry** | date, completed, checkedAt? | Check-in entries in HabitLogDocument, keyed by date for deterministic multi-device merging. |

All IDs are branded types (`TaskId`, `ProjectId`, `LabelId`, `NoteId`, `HabitId`, `RecurringId`) — prevents mixing them up at the type level.

### Task Statuses

| Status | Meaning |
|--------|---------|
| **active** | Ready to work on. The default state for new tasks. |
| **inprogress** | Currently being worked on. |
| **waiting** | Blocked on something external — another person, a dependency, information. Not actionable right now. |
| **done** | Completed. |
| **canceled** | Won't be done. Kept for history, not shown in active views. |

Status transitions are enforced: active/inprogress/waiting can transition freely among each other and to done/canceled. done and canceled can only reopen to active.

### External Sync Fields

Tasks and projects include fields for linking to external systems (GitHub Issues, Forgejo, etc.):

- **externalId** — The ID in the external system (e.g., GitHub issue number). Used to map todu entities to their external counterparts during sync.
- **sourceUrl** — URL to the external entity (e.g., `https://github.com/org/repo/issues/42`). For quick navigation.
- **systemId** (on Project) — Identifies which external system a project syncs with (e.g., `github:org/repo`). Used by sync extensions to know which projects they're responsible for.
- **syncStrategy** (on Project) — Controls sync direction: bidirectional (two-way), pull (external → todu only), push (todu → external only), none (no sync).

### Automerge Document Strategy

Data is spread across multiple Automerge documents to avoid any single document growing unboundedly. Heavy content (descriptions) is separated from lightweight metadata so that listing tasks doesn't require loading full content.

| Document Type | Scope | Contents | Growth Profile |
|--------------|-------|----------|---------------|
| **Catalog** (one) | Global | Projects, labels, recurring templates, habits, settings. Maps: taskListDocIds (projectId → docId), habitLogDocIds (habitId → docId), notesDocId. | Small, bounded. Arrays grow with entity count but each entry is small. |
| **TaskListDocument** (one per project) | Per project | Task metadata only: id, title, status, priority, labels, dates, externalId. Map: detailDocIds (taskId → docId). No descriptions. | ~200 bytes per task. A project with 500 tasks ≈ 100KB. |
| **TaskDetailDocument** (one per task) | Per task | Description (markdown) | 5-25KB typical. Loaded on demand when opening a task. |
| **NotesDocument** (one global) | Global | All notes — standalone journal entries and entity-attached notes (task, project, habit). | ~200 bytes per note. Thousands fit comfortably. |
| **HabitLogDocument** (one per habit) | Per habit | Check-in entries keyed by date (YYYY-MM-DD). Each entry: date, completed, checkedAt. | Grows ~30 bytes per check-in. Years of daily check-ins ≈ 10KB. |

**Why this split:**

- **Listing tasks is fast** — Load one small task list document per active project. No descriptions to wade through.
- **No unbounded documents** — Descriptions are isolated per-task. Habit logs are isolated per-habit.
- **On-demand loading** — Opening a task loads its detail document. Closing it can release it.
- **No indexes needed** — The task list documents serve as the indexes. Filtering by status/priority/label is an in-memory scan of a small document.
- **Cross-project queries** — Load task list documents for active projects (typically single digits). Each is small.
- **Archival is natural** — When a project is done, its task list and associated detail documents stop syncing. Still on disk if needed.
- **Deterministic merging** — HabitLogDocument entries keyed by date string merge cleanly across devices. Same habit + same date = same key = Automerge merges.

**Document lifecycle:**

- **Task creation** — Creates entry in TaskListDocument + new TaskDetailDocument (if description provided). Document IDs stored in detailDocIds map.
- **Task deletion** — Removed from TaskListDocument. Detail document abandoned (Automerge documents are append-only). If task was generated from a recurring template, its scheduled date is added to the template's skip list.
- **Habit creation** — Added to catalog habits array + new HabitLogDocument created. Document ID stored in habitLogDocIds map.
- **Habit deletion** — Removed from catalog. HabitLogDocument abandoned.
- **Search** — Searching across task titles is fast (scan task list documents). Full-text search across descriptions requires loading detail documents.
- **Schema migration** — `migrateCatalog()` runs on load, backfills any fields added in newer versions from `createEmptyCatalog()` defaults. Engine code can always assume catalog fields exist.

**Tradeoffs:**

- More documents to manage overall. The engine handles document lifecycle internally — consumers only see the SDK.
- Schema evolution requires a migration strategy. Automerge documents are append-only, so schema changes are applied by reading the old format and writing new fields. A version field in the catalog document tracks the current schema version.

## Scheduling Infrastructure

Recurring templates and habits share scheduling infrastructure but differ in behavior.

### Shared Components

- **RRULE validation** — Validates recurrence rules (RFC 5545). Only DAILY, WEEKLY, MONTHLY, YEARLY frequencies allowed — no sub-daily (HOURLY/MINUTELY/SECONDLY).
- **Deterministic ID generation** — `generateScheduledTaskId(templateId, date)` = `sha256(templateId|date).slice(0,12)` with `sched-` prefix. Same template + same date = same task ID on every device. Automerge merges identical writes.
- **Occurrence calculation** — `nextOccurrence()`, `nextOccurrences()`, `isScheduledDate()` — all timezone-aware, using IANA timezones.
- **Generate on access** — `processTemplates()` runs during `createTodu()` init. Every CLI invocation and Electron launch triggers it. One code path, no daemon, no on-complete trigger.
- **Processor registry** — `registerProcessor(type, fn)` allows recurring templates and habits to register their processing logic independently. One failing doesn't block others.

### Recurring Templates vs Habits

| Aspect | Recurring Template | Habit |
|--------|-------------------|-------|
| **Generates** | Normal tasks with deterministic IDs | Nothing — check-ins logged directly |
| **Multiple active** | Yes, they stack | No, only one at a time |
| **Missed occurrence** | New task created for each missed date | Missed = implicit failure (no entry in log) |
| **Catch-up** | Generate ALL missed tasks | Skip to today, advance nextDue |
| **Skip list** | Deleted generated task → date added to skippedDates[] | N/A |
| **Early materialization** | `generate(templateId, date)` creates future task now | N/A |
| **Upcoming view** | Project future RRULE occurrences without creating tasks | N/A |
| **Streaks** | N/A | Computed from check-in log, not stored |

### Why Not a Daemon?

The old todu-api used a daemon polling approach which had three problems: daemon dependency (must be running), dual generation paths (daemon + on-complete trigger), timezone coordination (daemon vs device timezone). Generate-on-access eliminates all three — `processTemplates()` runs during `createTodu()` and handles everything.

## AI Agent in Electron

The Electron app includes a lightweight AI agent for planning and organizing. It uses pi as an LLM abstraction layer — not as a product wrapper.

### Pi Dependencies (minimal)

| Dependency | Purpose |
|-----------|---------|
| `@mariozechner/pi-ai` | Model types, streaming, unified provider API |
| `@mariozechner/pi-agent-core` | Agent class, tool-call loop, AgentTool types |
| `@sinclair/typebox` | Tool parameter schema definitions |

### Why Not pi-coding-agent?

`pi-coding-agent` is the full pi product — TUI, interactive mode, session management, compaction, skills, themes, slash commands, extension system, coding tools. We'd use maybe 20% of it and carry the rest as dead weight. It would also couple us to pi's product roadmap and breaking changes.

`pi-ai` and `pi-agent-core` are focused, stable library packages. The agent loop is ~500 lines. If pi ever becomes a problem, we can replace it with raw Anthropic/OpenAI/Google SDKs.

### How It Works

The agent receives todu tools (thin wrappers over engine SDK operations) plus tools from todu extensions. No file system tools — the Electron agent is for planning, not coding.

Both the direct UI and the agent share the same engine instance and Automerge document. When the agent creates a task via tool call, the UI refreshes automatically.

| Aspect | Electron Agent | Pi in Terminal |
|--------|---------------|----------------|
| Input | Chat panel in Electron | Terminal prompt |
| Output | Streamed text + UI refresh | Terminal output |
| Tools | todu engine operations only | todu + file ops + bash + coding tools |
| File access | No | Yes (full coding agent) |
| Purpose | Planning, organizing, reasoning | Coding, testing, implementing |
| Model | User-configurable | User-configurable |

### Electron Process Model

Electron has two process types. The engine and agent run in the main process. The renderer is a pure UI layer that communicates via IPC.

```
┌─────────────────────────────────────────────────────────┐
│  Main Process (Node.js)                                 │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  @todu/engine │  │   pi-ai      │  │ pi-agent-core│  │
│  │  createTodu() │  │   streaming  │  │  agent loop  │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                 │                  │          │
│         └─────────┬───────┴──────────────────┘          │
│                   │                                     │
│            IPC Bridge (ipcMain)                          │
│                   │                                     │
└───────────────────┼─────────────────────────────────────┘
                    │  contextBridge.exposeInMainWorld()
┌───────────────────┼─────────────────────────────────────┐
│  Renderer Process  │  (Chromium)                         │
│                   │                                     │
│            window.todu API                              │
│                   │                                     │
│  ┌────────────────┴─────────────────────────────────┐   │
│  │               React UI                           │   │
│  │                                                  │   │
│  │  ┌─────────┐  ┌────────────┐  ┌──────────────┐  │   │
│  │  │ Sidebar │  │   Views    │  │  Agent Chat  │  │   │
│  │  │         │  │ (task list │  │  (streaming  │  │   │
│  │  │ Tasks   │  │  project   │  │   messages)  │  │   │
│  │  │ Projects│  │  habit     │  │              │  │   │
│  │  │ Habits  │  │  recurring │  │              │  │   │
│  │  │ Notes   │  │  label     │  │              │  │   │
│  │  │ Recur.  │  │  note)     │  │              │  │   │
│  │  └─────────┘  └────────────┘  └──────────────┘  │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**Why this split:**

- Engine uses Node.js APIs (filesystem, crypto) that aren't available in the renderer
- Agent tool calls mutate data — must happen in the same process as the engine
- Renderer is sandboxed — no direct Node.js access, only the exposed IPC API
- Clean separation makes it easy to reason about data flow

### IPC Architecture

The renderer communicates with the main process via a typed IPC bridge. The bridge mirrors the engine SDK namespaces so the renderer doesn't know it's crossing a process boundary.

**Preload script** exposes a `window.todu` API via `contextBridge.exposeInMainWorld()`:

```
window.todu.project.list()        → ipcRenderer.invoke('todu:project:list')
window.todu.task.create(input)    → ipcRenderer.invoke('todu:task:create', input)
window.todu.habit.check(id)       → ipcRenderer.invoke('todu:habit:check', id)
window.todu.agent.send(message)   → ipcRenderer.invoke('todu:agent:send', message)
```

**Main process** handles IPC channels by calling the engine SDK:

```
ipcMain.handle('todu:project:list', () => todu.project.list())
ipcMain.handle('todu:task:create', (_, input) => todu.task.create(input))
ipcMain.handle('todu:habit:check', (_, id) => todu.habit.check(id))
```

**Result serialization** — `Result<T>` objects serialize cleanly over IPC (plain JSON). No special handling needed. Errors stay as typed objects, not thrown exceptions.

**Agent streaming** — Agent responses stream from main to renderer via `ipcMain`/`ipcRenderer` events (not invoke/handle, which is request-response):

```
Main:     webContents.send('todu:agent:chunk', { text, toolCall })
Renderer: ipcRenderer.on('todu:agent:chunk', callback)
```

### Reactivity and State Management

When data changes (via direct UI or agent tool calls), the UI needs to update. Two mechanisms:

1. **Optimistic updates** — When the renderer calls `window.todu.task.create(input)`, it can optimistically add the task to local state. The IPC response confirms or rolls back.

2. **Change notifications** — The main process watches Automerge document changes and pushes notifications to the renderer:

```
Main:     catalog.on('change', () => webContents.send('todu:data:changed', { type: 'catalog' }))
Renderer: ipcRenderer.on('todu:data:changed', () => refetchQueries())
```

This is coarse-grained intentionally. The renderer re-fetches the data it needs rather than trying to apply granular diffs. Simple, correct, fast enough for a single-user app.

### Electron App UX

**Direct UI** — Task list, project views, habit tracking, recurring template management, notes, filters, forms. Standard CRUD backed by engine calls via IPC.

**Agent chat** — Side panel for natural language planning:
- "What's my highest priority work?"
- "Break this feature into subtasks."
- "Create tasks for each action item in these meeting notes."
- "What habits have I been consistent with this week?"

Agent responses stream in real-time. Tool calls are shown inline (e.g., "Created task: Fix login bug"). When a tool call mutates data, the UI refreshes via change notifications.

**UI Framework** — React with TypeScript. Chosen for ecosystem size, component libraries, and developer familiarity. No specific component library mandated yet — evaluate during implementation.

### Concerns Addressed

- **Scope** — Manageable. Electron is task UI + lightweight agent, not a full IDE.
- **Pi roadmap risk** — Minimal. Thin dependency on stable library packages, not the product.
- **Terminal-in-GUI** — Eliminated. No embedded terminal needed. Coding happens in an actual terminal.
- **Context window** — Small. Todu tools only, curated summaries, no file contents flooding context.
- **UX coherence** — A task manager that understands natural language, with an agent for planning and reasoning.
- **IPC complexity** — Mitigated by mirroring the SDK interface. The renderer's `window.todu` API looks identical to the engine SDK.

## Todu Extension System

Todu has its own extension system, separate from pi's. Extensions serve both the AI agent AND the direct UI.

A `ToduExtension` declares a name, optional **tools** (agent-callable), and optional **actions** (UI-callable). For example, a PDF extension might expose a `read_pdf` tool for the agent and an `export_tasks_pdf` action for the UI menu. A GitHub sync extension would expose sync operations as both tools and actions.

### Why Our Own Extension System?

- **Domain-specific** — Designed for task management (imports, exports, integrations, views), not coding
- **Serves both agent and UI** — Extensions provide agent tools AND UI actions/buttons. Pi extensions only serve the agent.
- **No pi dependency** — Doesn't couple us to pi's product roadmap or breaking changes
- **Lightweight** — No pi-tui, interactive mode, coding tools, slash commands, themes

## Pi Extension (Terminal)

The `todu-pi-extension` is a separate repo that registers todu tools inside pi for terminal coding workflows. It imports the engine directly, calls `createTodu()`, and wraps each SDK operation as a pi tool.

This replaces the current [todu-skills](https://github.com/evcraddock/todu-skills) approach (shelling out to the Go CLI). Benefits: direct Automerge access, typed parameters, faster execution.

The relationship between the two integration directions:

- **Electron app** = todu engine + pi agent (todu tools only)
- **Pi extension** = pi agent + todu engine (todu tools added to coding tools)

Same engine, same tools, two directions of integration. The CLI remains functional during migration, so existing todu-skills continue to work.

## Sync Architecture

### What Syncs via Automerge

- Tasks, projects, labels, notes, recurring templates, habits (structured data)
- Habit check-in logs (HabitLogDocument per habit)
- Curated session summaries as notes (not full conversation history)
- Configuration and settings

Summaries are written by the agent at the end of a work session — small, lossy but useful for cross-device context. Full pi session history stays local; it's not worth syncing, and Automerge isn't designed for append-only logs.

### Local Coordination (Same Machine)

When both Electron and CLI run on the same machine, they share data via Automerge sync — not a custom RPC layer. This uses the same protocol that powers multi-device sync, keeping the architecture simple and avoiding a second communication mechanism.

**Three runtime modes:**

```
Is Electron running locally?
  Yes → Ephemeral sync client (mode 2)
  No  → Open repo directly (mode 1)

Is a remote sync server configured?
  Yes → Replicate with it (mode 3, overlay on mode 1 or 2)
  No  → Local only
```

#### Mode 1: CLI Standalone

- CLI owns the Automerge repo directly (persistent `NodeFSStorageAdapter`)
- No Electron, no sync server
- Works on headless machines, servers, SSH sessions
- Can optionally sync with remote devices (mode 3)

#### Mode 2: CLI + Electron (Same Machine)

- **Electron** owns the repo with persistent storage and runs a WebSocket sync server on `127.0.0.1:24377`
- **CLI** opens an ephemeral repo (no storage adapter, in-memory only), syncs with Electron via Automerge sync protocol
- CLI mutates data, waits for changes to sync back to Electron, then disconnects
- **One copy of data on disk** (Electron's). CLI is a transient in-memory mirror that lives for the duration of one command.

#### Mode 3: Multi-Device Sync (Overlay)

- Each device runs mode 1 or mode 2 locally
- Automerge sync replicates between devices via a remote sync server
- See "Device Sync" below

```
Device A (Electron + CLI)           Device B (CLI standalone)
┌─────────────────────┐            ┌──────────────────┐
│  Electron           │            │  CLI              │
│  ├─ local server    │            │  └─ sync client ──┼──┐
│  │   ↑              │            └──────────────────┘  │
│  │  CLI (ephemeral) │                                   │
│  │                  │                                   │
│  └─ sync client ────┼──┐                                │
└─────────────────────┘  │                                │
                         │    ┌──────────────────┐        │
                         └───→│ Remote Sync Server│←───────┘
                              └──────────────────┘
```

**Why Automerge sync for local coordination (not RPC):**

- Both processes get a real `Todu` SDK instance — fully typed, no dual code paths
- `onChange` works naturally (Automerge fires change events when sync brings in remote changes)
- No protocol to maintain — Automerge handles serialization, conflict resolution, everything
- Same mechanism scales from local to multi-device without architectural changes
- Electron's Automerge Repo supports multiple network adapters simultaneously: local server adapter for CLI clients + remote client adapter for multi-device sync

**Why not RPC:**

An RPC layer would require reimplementing the entire Todu SDK as a client-server protocol (~40+ operations), maintaining message types, handling serialization, and managing two code paths in the CLI (direct engine vs RPC client). Automerge sync avoids all of this.

### Device Sync

Standard Automerge sync server — no custom server code needed:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Device A  │◄───►│  Automerge  │◄───►│   Device B  │
│             │     │ Sync Server │     │             │
└─────────────┘     └─────────────┘     └─────────────┘
```

Uses [automerge-repo-sync-server](https://github.com/automerge/automerge-repo-sync-server). Run via `npx` or Docker. Configure todu to connect via `sync.server` in config.

### External Sync (GitHub, Forgejo, etc.)

External sync is handled by todu extensions implementing a sync provider interface. To avoid race conditions with multiple devices, external sync runs through a **single sync worker** — never by multiple clients simultaneously.

**Single device** — Electron handles external sync directly.

**Multi-device** — A dedicated sync worker connects to the Automerge sync server and handles all external sync. Devices never talk to external systems directly. Changes propagate via Automerge.

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Device A  │◄───►│  Automerge  │◄───►│   Device B  │
│             │     │ Sync Server │     │             │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
                           ▼
                    ┌──────────────┐     ┌──────────────┐
                    │ Sync Worker  │◄───►│    GitHub    │
                    │              │     └──────────────┘
                    │              │     ┌──────────────┐
                    │              │◄───►│   Forgejo    │
                    └──────────────┘     └──────────────┘
```

## Configuration

Config file at `~/.config/toduai/config.yaml` (default). Covers: data directory, sync server URL, enabled extensions, agent default model, UI preferences.

### Config Resolution Order

1. `--config <path>` CLI flag (highest priority)
2. `TODUAI_CONFIG` environment variable
3. Default: `~/.config/toduai/config.yaml`

### Data Directory Resolution Order

1. `TODUAI_DATA_DIR` environment variable (for test isolation and explicit overrides)
2. `data_dir` field in config file (resolved relative to config file location)
3. Default: `~/.config/toduai/data`

### Dev Workflow

For project-specific data isolation, run `toduai config init` in a project directory. This creates `.toduai/config.yaml` + `.toduai/.gitignore`. Tell agents to use `--config .toduai/config.yaml` and they get an isolated data directory.

### Config Behavior

- **Malformed YAML fails fast** — `loadConfig` throws on parse errors, never silently ignores bad config.
- **Missing file returns defaults** — If the config file doesn't exist, default values are used.
- **No env vars for config values** — Prefer `--config` flag for dev, default config file for prod. `TODUAI_DATA_DIR` and `TODUAI_CONFIG` are primarily for test isolation and explicit local overrides.

## Build Tooling

| Tool | Purpose | Replaces |
|------|---------|----------|
| **Biome** | Linting + formatting (single tool, single config) | ESLint + Prettier |
| **tsgo** | TypeScript compilation (no bundling, individual .js files) | `bun build`, `tsc` |
| **Husky** | Pre-commit hooks (run check, re-stage formatted files) | — |
| **Vitest** | Testing | `bun test` |

Each package has a `tsconfig.build.json` that excludes test files from output. No bundling — raw `.js` + `.d.ts` + `.d.ts.map` output per file. Easier to debug and publish.

Import strategy: relative `.js` imports (no path aliases). `Node16` module resolution for npm compatibility. Path aliases require build-time resolution and break when consumers import published packages.

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Layered packages (core → engine → cli/electron)** | Each consumer imports only what it needs. Engine has zero UI knowledge. Mirrors pi-mono's proven pattern. |
| **SDK-first (createTodu())** | CLI, Electron, and pi extension share one code path. No business logic in UI layers. |
| **Pi as LLM plumbing, not product wrapper** | Thin dependency (pi-ai + pi-agent-core). Replaceable. No coupling to pi's roadmap. |
| **Own extension system, not pi's** | Domain-specific. Serves both agent and UI. No dead weight. |
| **Brain/hands split** | Electron for planning (safe, no file access). Terminal for coding (full pi agent). No terminal-in-GUI complexity. |
| **Automerge over SQLite** | Automatic conflict resolution, designed for multi-device sync |
| **Multi-document strategy** | No single document grows unboundedly. Task lists stay small (metadata only). Descriptions load on demand per task. Habit logs isolated per habit. Notes in one global doc. Task list docs double as indexes. |
| **Notes over Comments** | Generalized notes — standalone journal entries or attached to any entity (task, project, habit). Single Note type with optional entityType + entityId. Immutable (create + delete only). |
| **Generate on access, not daemon** | `processTemplates()` runs during `createTodu()` init. One code path, no daemon dependency, no timezone coordination issues. |
| **Deterministic IDs for multi-device** | `sha256(templateId\|date)` produces same task ID on every device. Automerge merges identical writes. No coordination needed. |
| **Habits are first-class, not recurring template variants** | Separate model and implementation. Habits track check-ins directly, don't generate tasks, compute streaks from log. |
| **Curated summaries, not full sessions** | Small, syncable, good enough for cross-device context. Automerge isn't designed for append-only logs. |
| **Separate packages, not single binary** | CLI doesn't need Electron. Electron doesn't need CLI arg parsing. |
| **Standard Automerge sync server** | No custom server code for device-to-device sync |
| **Dedicated sync worker for external systems** | Avoids race conditions with GitHub/Forgejo from multiple devices |
| **Biome over ESLint + Prettier** | One tool, one config, faster |
| **Relative .js imports, no path aliases** | `Node16` module resolution for npm compatibility. Path aliases break published packages. |

## Implementation Phases

### Phase 1: Core + Engine + CLI ✅

| Component | Deliverable | Status |
|-----------|-------------|--------|
| Build tooling | Biome, tsgo, Husky, Vitest, CI (GitHub Actions) | ✅ Done |
| `@todu/core` | Types, branded IDs, Automerge schema, validation, Result type, scheduling utilities (RRULE validation, deterministic IDs) | ✅ Done |
| `@todu/engine` | `createTodu()` SDK, Automerge doc management, project/task/label/note CRUD | ✅ Done |
| `@todu/engine` | Queries (multi-status filter, overdue/today, custom sorting, search) | ✅ Done |
| `@todu/engine` | Scheduling infrastructure (RRULE, processTemplates, processor registry) | ✅ Done |
| `@todu/engine` | Recurring templates (CRUD, task generation, skip list, upcoming, early materialization) | ✅ Done |
| `@todu/engine` | Habits (CRUD, check/uncheck, computed streaks, history) | ✅ Done |
| `@todu/engine` | Configuration system (`--config` flag, `config init`, resolution order) | ✅ Done |
| `@todu/cli` | Thin CLI (`toduai`) consuming engine, table/JSON output, color, status shortcuts | ✅ Done |
| Tests | 384 tests across 21 test files (unit + integration + CLI) | ✅ Done |

### Phase 2: Electron

| Component | Deliverable |
|-----------|-------------|
| `@todu/electron` | App foundation: Electron + React + TypeScript scaffold, main/renderer process structure, build pipeline (electron-builder or electron-forge) |
| `@todu/electron` | IPC bridge: preload script exposing `window.todu` API, ipcMain handlers wrapping engine SDK, change notification push from main to renderer |
| `@todu/electron` | Direct UI views: tasks (list + detail + create/edit), projects, labels, notes, recurring templates, habits (with streak display + check-in) |
| `@todu/electron` | Agent integration: pi-ai + pi-agent-core in main process, todu tool definitions (TypeBox schemas), agent chat panel with streaming responses and inline tool call display |
| `@todu/electron` | System tray: tray icon, show/hide window, quick create, minimize-to-tray, due today count |
| `@todu/electron` | Window management: size/position persistence, app icon |

### Phase 3: Sync

| Component | Deliverable |
|-----------|-------------|
| `@todu/engine` | Automerge sync server connection |
| `@todu/engine` | Curated summary generation |
| Documentation | Sync server setup guide |
| Testing | Multi-device sync verification |

### Phase 4: Extensions + Integrations

| Component | Deliverable |
|-----------|-------------|
| `@todu/engine` | Todu extension system (ToduExtension interface) |
| `todu-pi-extension` | Pi extension for terminal use (replaces todu-skills) |
| `todu-github` | GitHub Issues sync extension |
| `todu-forgejo` | Forgejo Issues sync extension |
| Sync worker | Standalone worker for multi-device external sync |

## Migration from todu-api

For users of the current todu-api + todu.sh:

1. Export data from todu-api (JSON format)
2. Run `toduai migrate import ./export.json`
3. Configure sync extensions for existing projects
4. Verify data, then sunset todu-api

During migration, existing todu-skills continue to work since the CLI remains functional.

## Out of Scope (v1)

- Mobile applications
- Web application
- Real-time collaboration (single-user focus)
- Custom sync server (use standard automerge-repo-sync-server)

## Future Considerations

- **Mobile apps** — React Native with `@todu/engine`
- **Team features** — Shared projects, assignments
- **Additional extensions** — Linear, Jira, Todoist, calendar sync
- **RAG addon** — Ingest task descriptions, notes, and external documents into a searchable vector database. The multi-document strategy makes this straightforward — subscribe to note and detail document changes independently.
- **Scheduled/event-driven jobs** — Daily digests, due date notifications

## References

- [Automerge](https://automerge.org/) — CRDT library
- [pi-mono](https://github.com/badlogic/pi-mono) — Architecture reference (MIT license)
- [pi-ai](https://www.npmjs.com/package/@mariozechner/pi-ai) — LLM streaming abstraction
- [pi-agent-core](https://www.npmjs.com/package/@mariozechner/pi-agent-core) — Agent loop
- [todu-api](https://github.com/evcraddock/todu-api) — Current API (being replaced)
- [todu.sh](https://github.com/evcraddock/todu.sh) — Current CLI (being replaced)
