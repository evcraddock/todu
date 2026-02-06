# todu Architecture

> Local-first task management with offline support, AI-powered planning, and seamless sync

This document describes the architecture for todu, a rewrite of [todu-api](https://github.com/evcraddock/todu-api) and [todu.sh](https://github.com/evcraddock/todu.sh) with a local-first approach.

## Vision

A task management system that:

- **Works offline** — Full functionality without internet
- **Syncs seamlessly** — Changes merge automatically across devices via Automerge
- **Plans with AI** — Embedded agent for organizing, planning, and reasoning about work
- **Extends via plugins** — Todu extension system for capabilities (PDF, exports, integrations)
- **Integrates with coding agents** — Pi extension for terminal-based coding workflows
- **Runs anywhere** — Desktop GUI (Electron) and terminal CLI

### The Brain/Hands Split

todu separates **planning** from **doing**:

- **Brain (Electron app)** — AI agent for planning, organizing, and reasoning about tasks. Uses todu tools only — no file system access. "What should I work on next?" "Break this feature into tasks." "Summarize what I accomplished this week."
- **Hands (pi in terminal)** — Full coding agent with todu extension for actual work. Reads task context, writes code, runs tests, records what was done.

Both share the same engine and data via Automerge.

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

### Package Responsibilities

| Package | Dependencies | Responsibility |
|---------|-------------|----------------|
| `@todu/core` | None (internal) | Types, branded IDs, Automerge schema, validation, constants |
| `@todu/engine` | `core`, `automerge` | SDK (`createTodu()`), CRUD operations, queries, sync, config, extension system |
| `@todu/cli` | `engine` | Arg parsing, command routing, output formatting (table/JSON), exit codes |
| `@todu/electron` | `engine`, `pi-ai`, `pi-agent-core` | Desktop GUI, AI agent for planning, system tray, notifications |
| `todu-pi-extension` | `engine` | Registers todu tools in pi for terminal coding workflows |
| `todu-github` | `engine` | Bidirectional sync with GitHub Issues (todu extension) |
| `todu-forgejo` | `engine` | Bidirectional sync with Forgejo Issues (todu extension) |

### Design Principles

- **SDK-first** — The engine exposes a programmatic API (`createTodu()`). CLI and Electron are thin consumers.
- **Bottom-up dependencies** — Each layer has zero knowledge of the layer above it. The engine doesn't know about CLI or Electron.
- **No business logic in UI layers** — CLI parses args and formats output. Electron renders views and wires the agent. All logic lives in the engine.

## Core Concepts

### Local-First with Automerge

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

### The Engine SDK

The engine is the central package. All consumers interact with todu through it:

```typescript
import { createTodu } from "@todu/engine";

const todu = createTodu({ storagePath: "~/.todu" });

// Task operations
const task = await todu.task.create({ title: "Fix login bug", project: "myapp", priority: "high" });
const tasks = await todu.task.list({ status: "active", priority: "high" });
await todu.task.update(taskId, { status: "done" });

// Project operations
const projects = await todu.project.list();

// Sync
await todu.sync.start();
todu.sync.status(); // → { connected: true, lastSync: "..." }

// Config
todu.config.get(); // → { storagePath, syncServer, ... }
```

The SDK interface:

```typescript
interface Todu {
  task: {
    create(input: CreateTaskInput): Promise<Result<Task>>;
    update(id: TaskId, input: UpdateTaskInput): Promise<Result<Task>>;
    delete(id: TaskId): Promise<Result<void>>;
    get(id: TaskId): Promise<Result<Task>>;
    list(filter?: TaskFilter): Promise<Result<Task[]>>;
    search(query: string): Promise<Result<Task[]>>;
    move(id: TaskId, projectId: ProjectId): Promise<Result<Task>>;
  };
  project: {
    create(input: CreateProjectInput): Promise<Result<Project>>;
    update(id: ProjectId, input: UpdateProjectInput): Promise<Result<Project>>;
    delete(id: ProjectId): Promise<Result<void>>;
    list(): Promise<Result<Project[]>>;
  };
  label: { /* same pattern */ };
  comment: {
    create(taskId: TaskId, input: CreateCommentInput): Promise<Result<Comment>>;
    list(taskId: TaskId): Promise<Result<Comment[]>>;
  };
  recurring: {
    create(input: CreateRecurringInput): Promise<Result<RecurringTemplate>>;
    update(id: string, input: UpdateRecurringInput): Promise<Result<RecurringTemplate>>;
    delete(id: string): Promise<Result<void>>;
    list(): Promise<Result<RecurringTemplate[]>>;
    process(): Promise<Result<Task[]>>; // Generate due tasks
  };
  sync: {
    start(): Promise<void>;
    stop(): Promise<void>;
    status(): SyncStatus;
  };
  config: {
    get(): ToduConfig;
    set(updates: Partial<ToduConfig>): void;
  };
}
```

### How Thin Is the CLI?

Very thin. A command like `todu task list --status active --priority high`:

```typescript
const todu = createTodu(loadConfig());
const result = await todu.task.list({ status: "active", priority: "high" });
if (!result.ok) { console.error(result.error); process.exit(1); }
console.log(formatTable(result.value));
```

Parse args → call engine → format output. That's it.

## AI Agent in Electron

The Electron app includes a lightweight AI agent for planning and organizing. It uses pi as an LLM abstraction layer — not as a product wrapper.

### Pi Dependencies (minimal)

```
@mariozechner/pi-ai          — Model types, streaming, unified provider API
@mariozechner/pi-agent-core  — Agent class, tool-call loop, AgentTool types, events
@sinclair/typebox            — Tool parameter schema definitions
```

No dependency on `pi-coding-agent`. No TUI, no extension system, no session management, no compaction, no skills, no themes. Pi is just the pipe to the LLM. These dependencies are replaceable — the Anthropic/OpenAI/Google SDKs are right there, and the agent loop is ~500 lines.

### How It Works

The agent gets todu tools (engine operations) plus tools from todu's own extension system. No file system tools.

```typescript
import { Agent } from "@mariozechner/pi-agent-core";
import { createTodu } from "@todu/engine";
import { Type } from "@sinclair/typebox";

const todu = createTodu({ storagePath: "~/.todu" });

const toduTools = [
  {
    name: "task_create",
    label: "Create Task",
    description: "Create a new task in a project",
    parameters: Type.Object({
      title: Type.String({ description: "Task title" }),
      project: Type.Optional(Type.String()),
      priority: Type.Optional(Type.String({ enum: ["low", "medium", "high"] })),
    }),
    async execute(_id, params) {
      const result = await todu.task.create(params);
      if (!result.ok) return { content: [{ type: "text", text: `Error: ${result.error}` }], details: {} };
      return { content: [{ type: "text", text: `Created task #${result.value.id}` }], details: result.value };
    }
  },
  // task_list, task_update, task_search, project_list, etc.
];

const agent = new Agent({
  initialState: {
    systemPrompt: "You are a task management assistant...",
    model,
    thinkingLevel: "off",
    tools: toduTools,
  },
});
```

### Electron App UX

**Direct UI (left panel):**
- Task list, project list, filters, forms
- Click to create/edit/complete tasks
- Backed by engine calls directly

**Agent chat (right panel or toggle):**
- "Show me overdue tasks across all projects"
- "Create tasks for each action item in these meeting notes"
- "What's my highest priority work right now?"
- "Break this feature into subtasks"

Both panels share the same engine instance. When the agent creates a task via tool, the direct UI refreshes — they share the same Automerge document.

## Todu Extension System

Todu has its own extension system, separate from pi's. Extensions serve both the AI agent AND the UI — pi extensions only serve the agent.

### Extension Interface

```typescript
interface ToduExtension {
  name: string;

  // Tools the AI agent can call
  tools?: ToolDefinition[];

  // Actions the engine/UI can call directly (no agent needed)
  actions?: ActionDefinition[];
}
```

### Example: PDF Extension

```typescript
const pdfExtension: ToduExtension = {
  name: "pdf",

  // Agent can ask to read a PDF
  tools: [{
    name: "read_pdf",
    description: "Extract text from a PDF file",
    parameters: Type.Object({ path: Type.String() }),
    execute: async (_id, params) => {
      const text = await extractPdfText(params.path);
      return { content: [{ type: "text", text }], details: {} };
    }
  }],

  // UI can export tasks without the agent
  actions: [{
    name: "export_tasks_pdf",
    label: "Export to PDF",
    execute: async (params) => { /* generate PDF from tasks */ }
  }]
};
```

### Why Our Own Extension System?

- **Domain-specific** — Designed for task management (imports, exports, integrations, views), not coding
- **Serves both agent and UI** — Extensions provide agent tools AND UI actions/buttons
- **No pi dependency** — Doesn't couple us to pi's product roadmap or breaking changes
- **Lightweight** — No pi-tui, interactive mode, coding tools, slash commands, themes

## Pi Extension (Terminal)

The `todu-pi-extension` is a separate repo that registers todu tools inside pi for terminal coding workflows. It imports the engine directly:

```typescript
import { createTodu } from "@todu/engine";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

export default function (pi: ExtensionAPI) {
  const todu = createTodu({ storagePath: "~/.todu" });

  pi.registerTool({
    name: "todu_task_list",
    description: "List tasks from todu",
    parameters: Type.Object({
      project: Type.Optional(Type.String()),
      status: Type.Optional(Type.String()),
    }),
    async execute(_id, params) {
      const result = await todu.task.list(params);
      // ...
    },
  });

  // todu_task_create, todu_task_update, todu_task_show, etc.
}
```

This replaces the current [todu-skills](https://github.com/evcraddock/todu-skills) approach (shelling out to CLI). Benefits: direct Automerge access, typed parameters, faster execution.

The CLI remains functional, so existing todu-skills continue to work during migration.

## Data Model

### Core Entities

```typescript
interface Task {
  id: string;
  title: string;
  description?: string;
  status: "active" | "inprogress" | "waiting" | "done" | "canceled";
  priority?: "high" | "medium" | "low";
  projectId?: string;
  labels: string[];
  dueDate?: Date;
  scheduledDate?: Date;
  externalId?: string;
  sourceUrl?: string;
  templateId?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface Project {
  id: string;
  name: string;
  description?: string;
  status: "active" | "done" | "canceled";
  priority: "high" | "medium" | "low";
  externalId?: string;
  systemId?: string;
  syncStrategy: "bidirectional" | "pull" | "push" | "none";
}

interface Label {
  id: string;
  name: string;
  color?: string;
}

interface Comment {
  id: string;
  taskId: string;
  content: string;
  author?: string;
  createdAt: Date;
}

interface RecurringTemplate {
  id: string;
  title: string;
  description?: string;
  projectId?: string;
  labels: string[];
  priority?: "high" | "medium" | "low";
  schedule: CronExpression;
  nextDue: Date;
  paused: boolean;
}
```

### Automerge Document Structure

```typescript
interface ToduDocument {
  tasks: Automerge.List<Task>;
  projects: Automerge.List<Project>;
  labels: Automerge.List<Label>;
  comments: Automerge.List<Comment>;
  recurringTemplates: Automerge.List<RecurringTemplate>;
  systems: Automerge.List<System>;
  settings: Settings;
}
```

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

Uses [automerge-repo-sync-server](https://github.com/automerge/automerge-repo-sync-server):

```bash
# Via npx
npx @automerge/automerge-repo-sync-server

# Or via Docker
docker run -d -p 3030:3030 -v ~/.todu/sync-data:/data \
  -e DATA_DIR=/data \
  ghcr.io/automerge/automerge-repo-sync-server:main
```

### External Sync (GitHub, Forgejo, etc.)

External sync is handled by todu extensions implementing a sync provider interface. To avoid race conditions with multiple devices, external sync runs through a **single sync worker** — never by multiple clients simultaneously.

**Single device:**

```
┌──────────────┐                    ┌──────────────┐
│   Electron   │◄──────────────────►│    GitHub    │
│  (worker     │                    │  (extension) │
│   built-in)  │                    └──────────────┘
└──────────────┘
```

**Multi-device:**

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

### Config File

`~/.todu/config.yaml`:

```yaml
sync:
  server: "wss://sync.example.com"
  enabled: true

extensions:
  - todu-github
  - todu-forgejo

recurring:
  enabled: true
  checkInterval: "1h"

agent:
  defaultModel: "anthropic/claude-sonnet-4-20250514"

ui:
  theme: "dark"
  defaultView: "inbox"
```

### Environment Variables

```bash
TODU_DATA_DIR=~/.todu/data
TODU_CONFIG_FILE=~/.todu/config.yaml
TODU_SYNC_SERVER=wss://...
```

## Build Tooling

| Tool | Purpose | Replaces |
|------|---------|----------|
| **Biome** | Linting + formatting (single tool, single config) | ESLint + Prettier |
| **tsgo** or **tsc** | TypeScript compilation (no bundling, individual .js files) | `bun build` |
| **Husky** | Pre-commit hooks (run check, re-stage formatted files) | — |
| **Vitest** | Testing | `bun test` |

Each package has a `tsconfig.build.json` that excludes test files from output. No bundling — raw `.js` + `.d.ts` + `.d.ts.map` output per file. Easier to debug and publish.

Import strategy: relative `.js` imports (no path aliases). `Node16` module resolution for npm compatibility.

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Layered packages (core → engine → cli/electron)** | Each consumer imports only what it needs. Engine has zero UI knowledge. |
| **SDK-first (createTodu())** | CLI, Electron, and pi extension share one code path |
| **Pi as LLM plumbing, not product wrapper** | Thin dependency (pi-ai + pi-agent-core). Replaceable. No coupling to pi's roadmap. |
| **Own extension system, not pi's** | Domain-specific. Serves both agent and UI. No dead weight. |
| **Brain/hands split** | Electron for planning (safe, no file access). Terminal for coding (full pi agent). |
| **Automerge over SQLite** | Automatic conflict resolution, designed for multi-device sync |
| **Curated summaries, not full sessions** | Small, syncable, good enough for cross-device context |
| **Separate packages, not single binary** | CLI doesn't need Electron. Electron doesn't need CLI arg parsing. |
| **Standard Automerge sync server** | No custom server code for device-to-device sync |
| **Dedicated sync worker for external systems** | Avoids race conditions with GitHub/Forgejo from multiple devices |
| **Biome over ESLint + Prettier** | One tool, one config, faster |

## Implementation Phases

### Phase 1: Core + Engine + CLI

| Component | Deliverable |
|-----------|-------------|
| Build tooling | Biome, tsgo/tsc, Husky, Vitest setup |
| `@todu/core` | Types, branded IDs, Automerge schema, validation |
| `@todu/engine` | `createTodu()` SDK, task/project/label/comment/recurring CRUD |
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
| `todu-pi-extension` | Pi extension for terminal use (depends on engine) |
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
