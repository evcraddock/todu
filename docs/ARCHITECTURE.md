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
| `@todu/core` | None | Types, branded IDs (TaskId, ProjectId, LabelId), status/priority enums, type guards, Automerge document schema, validation functions, `Result<T, E>` type, shared constants |
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
| `todu.task` | create, update, delete, get, list, search, move |
| `todu.project` | create, update, delete, list |
| `todu.label` | create, update, delete, list |
| `todu.comment` | create, list (scoped to task) |
| `todu.recurring` | create, update, delete, list, process |
| `todu.sync` | start, stop, status |
| `todu.config` | get, set |

All mutation/query operations return `Result<T>` (success or typed error). The CLI, Electron, and pi extension all go through this same interface.

The CLI is extremely thin: parse args → call engine → format output → exit code. No business logic whatsoever.

## Local-First with Automerge

All data is stored locally using [Automerge](https://automerge.org/) CRDTs (Conflict-free Replicated Data Types).

**Benefits:**

- Works completely offline
- No server required for basic operations
- Automatic conflict resolution when syncing
- Data sovereignty — your tasks stay on your machine

**Storage location:** `~/.todu/data/`

**Automerge packages used:**

- `@automerge/automerge-repo` — Core document management
- `@automerge/automerge-repo-storage-nodefs` — Filesystem persistence
- `@automerge/automerge-repo-network-websocket` — Sync server connection

## Data Model

### Core Entities

| Entity | Key Fields | Notes |
|--------|-----------|-------|
| **Task** | id, title, description, status, priority, projectId, labels[], dueDate, scheduledDate, externalId, sourceUrl, templateId, createdAt, updatedAt | Status: active, inprogress, waiting, done, canceled. Priority: high, medium, low. |
| **Project** | id, name, description, status, priority, externalId, systemId, syncStrategy | syncStrategy: bidirectional, pull, push, none |
| **Label** | id, name, color | Shared across all projects |
| **Comment** | id, taskId, content, author, createdAt | Author tracks human vs agent comments |
| **RecurringTemplate** | id, title, description, projectId, labels[], priority, schedule (cron), nextDue, paused | Generates tasks when due |

All IDs are branded types (e.g., `TaskId`, `ProjectId`) — prevents mixing them up at the type level.

### Automerge Document Structure

A single Automerge document holds all data: tasks, projects, labels, comments, recurring templates, registered external systems, and settings. This is the unit of sync — the entire document replicates across devices.

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

### Electron App UX

- **Direct UI** — Task list, project views, filters, forms. Standard CRUD backed by engine calls.
- **Agent chat** — Natural language planning. "What's my highest priority work?" "Break this feature into subtasks." "Create tasks for each action item in these meeting notes."

### Concerns Addressed

- **Scope** — Manageable. Electron is task UI + lightweight agent, not a full IDE.
- **Pi roadmap risk** — Minimal. Thin dependency on stable library packages, not the product.
- **Terminal-in-GUI** — Eliminated. No embedded terminal needed. Coding happens in an actual terminal.
- **Context window** — Small. Todu tools only, curated summaries, no file contents flooding context.
- **UX coherence** — A task manager that understands natural language, with an agent for planning and reasoning.

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

- Tasks, projects, labels, comments, recurring templates (structured data)
- Curated session summaries as task comments (not full conversation history)
- Configuration and settings

Summaries are written by the agent at the end of a work session — small, lossy but useful for cross-device context. Full pi session history stays local; it's not worth syncing, and Automerge isn't designed for append-only logs.

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

Config file at `~/.todu/config.yaml` covers: sync server URL, enabled extensions, recurring task interval, agent default model, UI preferences.

Environment variable overrides: `TODU_DATA_DIR`, `TODU_CONFIG_FILE`, `TODU_SYNC_SERVER`.

## Build Tooling

| Tool | Purpose | Replaces |
|------|---------|----------|
| **Biome** | Linting + formatting (single tool, single config) | ESLint + Prettier |
| **tsgo** or **tsc** | TypeScript compilation (no bundling, individual .js files) | `bun build` |
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
| **Curated summaries, not full sessions** | Small, syncable, good enough for cross-device context. Automerge isn't designed for append-only logs. |
| **Separate packages, not single binary** | CLI doesn't need Electron. Electron doesn't need CLI arg parsing. |
| **Standard Automerge sync server** | No custom server code for device-to-device sync |
| **Dedicated sync worker for external systems** | Avoids race conditions with GitHub/Forgejo from multiple devices |
| **Biome over ESLint + Prettier** | One tool, one config, faster |
| **Relative .js imports, no path aliases** | `Node16` module resolution for npm compatibility. Path aliases break published packages. |

## Implementation Phases

### Phase 1: Core + Engine + CLI

| Component | Deliverable |
|-----------|-------------|
| Build tooling | Biome, tsgo/tsc, Husky, Vitest setup |
| `@todu/core` | Types, branded IDs, Automerge schema, validation, Result type |
| `@todu/engine` | `createTodu()` SDK, Automerge doc management, task/project/label/comment/recurring CRUD |
| `@todu/engine` | Queries (filter, sort, search) |
| `@todu/cli` | Thin CLI consuming engine, table/JSON output |
| Tests | Unit tests for core, integration tests for engine |

### Phase 2: Electron

| Component | Deliverable |
|-----------|-------------|
| `@todu/electron` | App foundation (window mgmt, IPC, system tray) |
| `@todu/electron` | Direct UI (task list, project views, forms) |
| `@todu/electron` | Embedded AI agent (pi-ai + pi-agent-core, todu tools) |
| `@todu/electron` | Agent chat panel |

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
2. Run `todu migrate import ./export.json`
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
- **Habit tracking** — Extend recurring templates
- **Scheduled/event-driven jobs** — Daily digests, due date notifications

## References

- [Automerge](https://automerge.org/) — CRDT library
- [pi-mono](https://github.com/badlogic/pi-mono) — Architecture reference (MIT license)
- [pi-ai](https://www.npmjs.com/package/@mariozechner/pi-ai) — LLM streaming abstraction
- [pi-agent-core](https://www.npmjs.com/package/@mariozechner/pi-agent-core) — Agent loop
- [todu-api](https://github.com/evcraddock/todu-api) — Current API (being replaced)
- [todu.sh](https://github.com/evcraddock/todu.sh) — Current CLI (being replaced)
