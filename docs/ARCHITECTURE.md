# todu Architecture

> Local-first task management with offline support and seamless sync

This document describes the architecture for todu, a rewrite of [todu-api](https://github.com/evcraddock/todu-api) and [todu.sh](https://github.com/evcraddock/todu.sh) with a local-first approach.

## Vision

A task management system that:

- **Works offline** - Full functionality without internet
- **Syncs seamlessly** - Changes merge automatically across devices
- **Integrates with coding agents** - First-class pi extension support
- **Extends via plugins** - GitHub, Forgejo, and future integrations as separate packages
- **Runs anywhere** - Desktop GUI and terminal CLI

## Package Structure

```
@todu/core                    # Shared library (npm package)
├── Automerge document schema
├── Types (Task, Project, Label, etc.)
├── Data access functions (using automerge-repo)
├── Plugin API interfaces
└── Shared utilities

todu                          # Main application
├── packages/core             # @todu/core source
├── packages/app              # Unified CLI + Electron app (single binary)
└── packages/worker           # Standalone sync worker (post-MVP, for multi-device)

todu-pi-extension             # Separate repo
└── Pi coding agent tools

todu-github                   # Separate repo
└── GitHub Issues sync plugin

todu-forgejo                  # Separate repo
└── Forgejo Issues sync plugin
```

### Package Responsibilities

| Package             | Responsibility                                                        |
| ------------------- | --------------------------------------------------------------------- |
| `@todu/core`        | Data model, storage, plugin API - the foundation everything builds on |
| `todu`              | User-facing application (GUI, CLI, daemon)                            |
| `todu-pi-extension` | Registers LLM-callable tools for pi coding agent                      |
| `todu-github`       | Bidirectional sync with GitHub Issues                                 |
| `todu-forgejo`      | Bidirectional sync with Forgejo Issues                                |

## Core Concepts

### Local-First with Automerge

All data is stored locally using [Automerge](https://automerge.org/) CRDTs (Conflict-free Replicated Data Types).

**Benefits:**

- Works completely offline
- No server required for basic operations
- Automatic conflict resolution when syncing
- Data sovereignty - your tasks stay on your machine

**Storage location:** `~/.todu/data/`

### Single Binary, Multiple Modes

The `todu` binary operates in different modes based on context:

```bash
todu                     # Launch Electron GUI
todu task list           # CLI mode - output to terminal
todu --gui task list     # Open GUI with task list view
```

**Mode detection:**

1. If subcommand provided → CLI mode
2. If `--gui` flag → Electron mode
3. If interactive terminal, no args → Electron mode
4. If piped/no TTY → CLI mode

### Sync Architecture

**Single device:**

```
┌──────────────┐                    ┌──────────────┐
│   Electron   │◄──────────────────►│    GitHub    │
│   (worker    │                    │   (plugin)   │
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
                    ┌─────────────┐     ┌─────────────┐
                    │   Worker    │◄───►│   GitHub    │
                    │             │     │   (plugin)  │
                    └─────────────┘     └─────────────┘
```

Devices sync with each other via Automerge. Only the worker talks to external systems.

**Two types of sync:**

1. **Device sync** - Standard Automerge sync server
   - Uses [automerge-repo-sync-server](https://github.com/automerge/automerge-repo-sync-server)
   - Run via `npx @automerge/automerge-repo-sync-server` or Docker
   - todu connects using `@automerge/automerge-repo-network-websocket`
   - No custom server code needed

2. **External sync** - Plugins (GitHub, Forgejo, etc.)
   - Bidirectional sync with external issue trackers
   - Plugin implements the sync logic
   - Maps todu tasks ↔ external issues

**Automerge-repo packages used:**

- `@automerge/automerge-repo` - Core document management
- `@automerge/automerge-repo-storage-nodefs` - Filesystem persistence
- `@automerge/automerge-repo-network-websocket` - Sync server connection

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
  externalId?: string; // Link to external system (e.g., GitHub issue number)
  sourceUrl?: string; // URL to external issue
  templateId?: string; // If created from recurring template
  createdAt: Date;
  updatedAt: Date;
}

interface Project {
  id: string;
  name: string;
  description?: string;
  status: "active" | "done" | "canceled";
  priority: "high" | "medium" | "low";
  externalId?: string; // e.g., "owner/repo" for GitHub
  systemId?: string; // Which external system this syncs with
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
interface TodouDocument {
  tasks: Automerge.List<Task>;
  projects: Automerge.List<Project>;
  labels: Automerge.List<Label>;
  comments: Automerge.List<Comment>;
  recurringTemplates: Automerge.List<RecurringTemplate>;
  systems: Automerge.List<System>; // Registered external systems
  settings: Settings;
}
```

## Plugin System

todu has an **open plugin ecosystem** - anyone can create and distribute plugins for external system integrations.

### Plugin API

Plugins implement a sync provider interface defined in `@todu/core`:

```typescript
interface SyncProvider {
  // Metadata
  readonly name: string;
  readonly version: string;

  // Lifecycle
  initialize(config: PluginConfig): Promise<void>;
  shutdown(): Promise<void>;

  // Sync operations
  pull(project: Project): Promise<ExternalTask[]>;
  push(tasks: Task[], project: Project): Promise<void>;

  // Mapping
  mapToTask(external: ExternalTask): Task;
  mapFromTask(task: Task): ExternalTask;

  // Optional: webhook support
  handleWebhook?(payload: unknown): Promise<void>;

  // Optional: background jobs (see Background Job System)
  backgroundJobs?: BackgroundJob[];
}
```

### Plugin Installation

```bash
todu plugin install todu-github       # Install from registry/npm
todu plugin install ./local-plugin    # Install from local path
todu plugin list                      # List installed plugins
todu plugin remove todu-github        # Uninstall
```

**Plugin storage:** `~/.todu/plugins/`

### Plugin Configuration

Plugins are configured per-project:

```bash
todu project configure myproject --sync-provider github --sync-config '{"repo": "owner/repo"}'
```

Or via the GUI settings.

### Plugin Ecosystem

- **Distribution:** Plugins are npm packages or git repositories
- **Discovery:** Plugin registry (future) or direct install by name/URL
- **Security:** Users choose which plugins to install (same trust model as npm)
- **API Versioning:** Plugins declare compatible `@todu/core` versions

## Pi Coding Agent Integration

### Current Approach: Skills

The current [todu-skills](https://github.com/evcraddock/todu-skills) uses markdown instructions that tell the agent to shell out to CLI commands:

```markdown
# task-create skill

Run: todu task create --title "..." --project "..."
```

**Limitations:**

- Subprocess overhead per command
- No typed parameters
- Limited UI integration

### New Approach: Pi Extension

The `todu-pi-extension` registers native LLM tools:

```typescript
import { loadDoc, type Task } from "@todu/core";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

export default function (pi: ExtensionAPI) {
  const doc = loadDoc();

  pi.registerTool({
    name: "todu_task_list",
    description: "List tasks from todu task manager",
    parameters: Type.Object({
      project: Type.Optional(Type.String({ description: "Filter by project name" })),
      status: Type.Optional(Type.String({ description: "Filter by status" })),
      limit: Type.Optional(Type.Number({ description: "Max results" })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const tasks = doc.tasks.filter(
        (t) =>
          (!params.project || t.projectId === params.project) &&
          (!params.status || t.status === params.status)
      );

      return {
        content: [{ type: "text", text: formatTaskList(tasks) }],
        details: { count: tasks.length },
      };
    },
  });

  pi.registerTool({
    name: "todu_task_create",
    description: "Create a new task",
    parameters: Type.Object({
      title: Type.String({ description: "Task title" }),
      project: Type.Optional(Type.String({ description: "Project name" })),
      priority: Type.Optional(Type.String({ description: "high, medium, or low" })),
      description: Type.Optional(Type.String({ description: "Task description" })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const task = createTask(doc, params);
      return {
        content: [{ type: "text", text: `Created task #${task.id}: ${task.title}` }],
        details: { taskId: task.id },
      };
    },
  });

  // ... more tools: todu_task_update, todu_project_list, etc.
}
```

**Benefits:**

- Direct Automerge access (no subprocess)
- Typed parameters with descriptions
- Can use pi's custom UI (task selectors, confirmations)
- Faster execution

### Backward Compatibility

The CLI remains fully functional, so existing todu-skills continue to work. Users can migrate to the pi extension when ready.

## Background Operations

Background operations include:

1. **Device sync** - Sync with Automerge sync server
2. **Plugin sync** - Run registered sync providers (GitHub, Forgejo, etc.)
3. **Recurring tasks** - Create tasks from recurring templates when due
4. **Notifications** - Desktop notifications for due tasks

### Single Device (Electron)

The Electron app handles all background operations while running. It can minimize to the system tray and continue working in the background.

### Multi-Device

A sync worker handles plugin sync and recurring tasks. See [Sync Worker Architecture](#sync-worker-architecture).

### Headless (CLI-only)

For CLI-only usage without Electron or a sync worker:

- Use cron to run `todu recurring process` for recurring tasks
- Use `todu sync` for manual sync triggers

## Configuration

### Config File

`~/.todu/config.yaml`:

```yaml
# Device-to-device sync via automerge-repo-sync-server
sync:
  server: "wss://sync.example.com" # Your sync server URL
  enabled: true

# Plugin sync intervals
plugins:
  github:
    interval: "10m"
  forgejo:
    interval: "10m"

# Recurring task processing
recurring:
  enabled: true
  checkInterval: "1h"

# UI preferences
ui:
  theme: "dark"
  defaultView: "inbox"
```

### Running a Sync Server

For multi-device sync, run the standard Automerge sync server:

```bash
# Via npx
npx @automerge/automerge-repo-sync-server

# Or via Docker
docker run -d -p 3030:3030 -v ~/.todu/sync-data:/data \
  -e DATA_DIR=/data \
  ghcr.io/automerge/automerge-repo-sync-server:main
```

Then configure todu to connect: `sync.server: "ws://localhost:3030"`

### Environment Variables

```bash
TODU_DATA_DIR=~/.todu/data        # Automerge storage location
TODU_CONFIG_FILE=~/.todu/config.yaml
TODU_SYNC_SERVER=wss://...        # Override sync server
```

## Sync Worker Architecture

### The Problem

With Automerge, each device has a full copy of the data. When syncing with external systems (GitHub, Forgejo), we need to avoid:

- Duplicate issues created by multiple devices
- Race conditions when updating external systems
- Lost external IDs during concurrent syncs

### Solution: Sync Worker

External sync is handled by a **single sync worker** - never by multiple clients simultaneously.

```
┌─────────────────────────────────────────────────────────────────────┐
│                      SINGLE DEVICE                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌──────────────┐                          ┌──────────────┐       │
│   │   Electron   │◄────────────────────────►│    GitHub    │       │
│   │  (worker     │                          └──────────────┘       │
│   │   built-in)  │                                                  │
│   └──────────────┘                                                  │
│         │                                                           │
│         ▼                                                           │
│   Local Automerge                                                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      MULTI-DEVICE                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐       │
│   │   Device A   │◄───►│  Automerge   │◄───►│   Device B   │       │
│   │  (no external│     │  Sync Server │     │  (no external│       │
│   │   sync)      │     └──────┬───────┘     │   sync)      │       │
│   └──────────────┘            │             └──────────────┘       │
│                               │                                     │
│                               ▼                                     │
│                        ┌──────────────┐     ┌──────────────┐       │
│                        │ Sync Worker  │◄───►│    GitHub    │       │
│                        │ (handles all │     └──────────────┘       │
│                        │  external    │     ┌──────────────┐       │
│                        │  sync)       │◄───►│   Forgejo    │       │
│                        └──────────────┘     └──────────────┘       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### How It Works

**Single device mode:**

- Electron app includes the sync worker functionality
- Handles external sync directly
- No coordination needed

**Multi-device mode:**

- A dedicated sync worker connects to the Automerge sync server
- Worker watches for changes and handles all external sync
- Devices never talk to external systems directly
- Changes propagate to devices via Automerge

**Self-hosted option:**

- Users can run their own sync server + worker
- Credentials stay on their infrastructure

### Plugin Execution

Plugins run in the sync worker (wherever that is):

```typescript
// Same plugin API regardless of where it runs
interface SyncProvider {
  name: string;
  version: string;
  pull(project: Project): Promise<ExternalTask[]>;
  push(tasks: Task[], project: Project): Promise<void>;
  // ...
}
```

- **Single device:** Plugins run in Electron
- **Multi-device:** Plugins run in the sync worker
- **Self-hosted:** Plugins run in user's worker

### Recurring Tasks

Recurring task templates can be created and managed in the MVP, but automatic processing requires the sync worker (post-MVP).

**MVP:**

- Create, list, update, delete recurring templates
- Manual processing via `todu recurring process`

**Post-MVP (with sync worker):**

- **Single device:** Electron handles it while running in tray
- **Multi-device:** Sync worker handles it
- **Headless/CLI-only:** Use cron to run `todu recurring process`

```bash
# For headless servers without a worker
*/30 * * * * todu recurring process
```

### Background Job System

The sync worker uses a job system to manage background operations. This provides a unified way to handle all "run once" operations.

#### Job Types

| Type             | Trigger              |   v1   | Example                        |
| ---------------- | -------------------- | :----: | ------------------------------ |
| **Periodic**     | Interval elapsed     |   ✓    | External sync every 10 minutes |
| **Scheduled**    | Specific time (cron) | Future | Daily digest at 9am            |
| **Event-driven** | Something changes    | Future | Notify when task becomes due   |

#### Job Interface

```typescript
interface BackgroundJob {
  name: string;
  type: "periodic" | "scheduled" | "event";

  // Periodic: run every N minutes
  interval?: string; // "5m", "10m", "1h"

  // Scheduled: run at specific times (future)
  schedule?: string; // cron expression, e.g., "0 9 * * *"

  // Event-driven: react to triggers (future)
  trigger?: string; // e.g., "task:due", "sync:complete"

  run(context: JobContext): Promise<void>;
}
```

#### Built-in Jobs (v1)

| Job                        | Type     | Default Interval |
| -------------------------- | -------- | ---------------- |
| External sync (per plugin) | Periodic | 10 minutes       |
| Recurring task processing  | Periodic | 30 minutes       |

#### Plugin-Registered Jobs

Plugins can register their own background jobs:

```typescript
interface SyncProvider {
  // ... existing sync methods ...

  // Optional: plugin-specific background jobs
  backgroundJobs?: BackgroundJob[];
}
```

This allows plugins to add custom periodic operations (e.g., a calendar plugin syncing events, a notification plugin checking for due tasks).

---

## Key Design Decisions

| Decision                           | Rationale                                                   |
| ---------------------------------- | ----------------------------------------------------------- |
| **Automerge over SQLite**          | Automatic conflict resolution, designed for sync            |
| **Single binary**                  | Simpler distribution, shared code                           |
| **Plugins as separate repos**      | Independent versioning, community contributions             |
| **Open plugin ecosystem**          | Anyone can create plugins, npm-style distribution           |
| **Pi extension over skills**       | Performance, type safety, better UX                         |
| **No web app**                     | Reduced scope, desktop+CLI covers primary use cases         |
| **Standard Automerge sync server** | Don't reinvent the wheel for device-to-device sync          |
| **Dedicated sync worker**          | Avoids race conditions with external systems (GitHub, etc.) |
| **Plugins run in worker**          | Same plugin API works locally or server-side                |
| **Extensible job system**          | Periodic jobs now, scheduled/event jobs later               |

## Migration from todu-api

For users of the current todu-api + todu.sh:

1. Export data from todu-api (JSON format)
2. Run `todu migrate import ./export.json`
3. Configure sync plugins for existing projects
4. Verify data, then sunset todu-api

Migration tooling will be provided in the `todu` package.

## Implementation Phases

### MVP: Local App + Multi-Device Sync

#### Phase 1: Core + CLI

| Component      | Deliverable                                  |
| -------------- | -------------------------------------------- |
| `@todu/core`   | Automerge schema, types, data access         |
| `packages/cli` | task, project, label, comment CRUD           |
| `packages/cli` | Recurring template CRUD (no auto-processing) |

#### Phase 2: Electron

| Component           | Deliverable              |
| ------------------- | ------------------------ |
| `packages/electron` | Desktop GUI, system tray |

#### Phase 3: Multi-Device Sync

| Component     | Deliverable                 |
| ------------- | --------------------------- |
| Documentation | Automerge sync server setup |
| `@todu/core`  | Sync server connection      |

**MVP Complete:** Full task management with multi-device sync via Automerge.

---

### Post-MVP

#### Phase 4: Pi Extension

| Component           | Deliverable                               |
| ------------------- | ----------------------------------------- |
| `todu-pi-extension` | Native LLM tools, direct Automerge access |

#### Phase 5: Sync Worker + Background Jobs

| Component         | Deliverable            |
| ----------------- | ---------------------- |
| `packages/worker` | Standalone sync worker |
| Background jobs   | Periodic job system    |
| Recurring tasks   | Automatic processing   |

#### Phase 6: Plugin System + External Sync

| Component      | Deliverable         |
| -------------- | ------------------- |
| `@todu/core`   | Plugin API          |
| `todu-github`  | GitHub sync plugin  |
| `todu-forgejo` | Forgejo sync plugin |

#### Phase 7: Polish

| Component       | Deliverable               |
| --------------- | ------------------------- |
| Migration       | Import from todu-api      |
| Background jobs | Scheduled/event job types |

---

## Out of Scope (v1)

- Mobile applications (future enhancement)
- Web application
- Real-time collaboration (single-user focus)
- Custom sync server (use standard automerge-repo-sync-server)

## Future Considerations

- **Mobile apps** - React Native with @todu/core
- **Team features** - Shared projects, assignments
- **Additional plugins** - Linear, Jira, Todoist, etc.
- **Habit tracking** - Extend recurring templates
- **Scheduled jobs** - Run operations at specific times (cron-style)
- **Event-driven jobs** - React to changes (notifications, webhooks)

---

## References

- [Automerge](https://automerge.org/) - CRDT library
- [Pi Coding Agent](https://github.com/anthropics/pi-coding-agent) - Extension framework
- [todu-api](https://github.com/evcraddock/todu-api) - Current API (being replaced)
- [todu.sh](https://github.com/evcraddock/todu.sh) - Current CLI (being replaced)
