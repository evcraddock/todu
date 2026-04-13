# SyncProvider API (Plugin Author Guide)

This document defines the external sync plugin contract exported by `@todu/core`.

For generic daemon worker plugins, see `docs/worker-plugin-api.md`.

## Purpose

`SyncProvider` is the runtime contract for plugins that synchronize todu data with external systems such as GitHub or Forgejo.

This document defines the provider execution contract. Shared integration binding desired state is a separate architecture concern owned by core and documented in `docs/architecture/integrations.md`.

Core-owned imported-content approval metadata also remains outside provider-managed state. Task description approval metadata lives with `TaskDetailDocument`, note/comment approval metadata lives with `Note`, and later runtime work is responsible for deriving approval from binding identity, actor identity, and content fingerprint.

## Relationship to generic integration architecture

Provider plugins should not own the canonical cross-device integration binding registry for projects and external targets.

Instead:

- core owns the synced integration binding model
- the daemon/plugin host enumerates applicable integration bindings for a provider
- the provider executes sync work for integration bindings supplied by the host
- provider runtime internals remain local to the authority daemon host

Use local provider configuration for secrets and host-local runtime settings, not for synced integration binding desired state.

## Compatibility Policy

Compatibility is API-version based.

- Latest provider API version: `SYNC_PROVIDER_API_VERSION` (currently `3`).
- Host-supported provider API versions during the rollout window: `SYNC_PROVIDER_SUPPORTED_API_VERSIONS` (currently `2` and `3`).
- Every provider manifest must declare `apiVersion`.
- Providers are loadable only when `manifest.apiVersion` is included in the host-supported version set.
- Unsupported versions must fail closed at load time.
- Provider API v2 remains a transition contract and will be removed after the compatibility window closes.

Use `validateSyncProviderRegistration(...)` during plugin load to enforce this gate.

## Manifest Contract

```ts
interface SyncProviderManifest {
  name: string;
  version: string;
  apiVersion: number;
}
```

Rules:

- `name` must be non-empty.
- `version` must be non-empty.
- `apiVersion` must be a positive integer and API-compatible with host runtime.

## API v2 contract

API v2 is the legacy string-based provider contract.

```ts
interface ExternalTask {
  externalId: string;
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  labels?: string[];
  assignees?: string[];
  sourceUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  raw?: unknown;
}

interface ExternalComment {
  externalId: string;
  externalTaskId: string;
  body: string;
  author?: string;
  createdAt: string;
  updatedAt?: string;
  raw?: unknown;
}

interface SyncProviderV2 {
  readonly name: string;
  readonly version: string;
  initialize(config: SyncProviderConfig): Promise<void>;
  shutdown(): Promise<void>;
  pull(binding: IntegrationBinding, project: Project): Promise<SyncProviderPullResult>;
  push(binding: IntegrationBinding, tasks: TaskPushPayload[], project: Project): Promise<SyncProviderPushResult>;
  mapToTask(external: ExternalTask, project: Project): Task;
  mapFromTask(task: TaskPushPayload, project: Project): ExternalTask;
}
```

`TaskPushPayload` extends `TaskWithDetail` with `comments: Note[]`, providing each task's description and attached comments during push.

Use v2 only for compatibility with the existing runtime shim path.

## API v3 contract

API v3 replaces direct `mapToTask(...)` and `mapFromTask(...)` coupling with normalized import/export payloads and structured external actor references.

```ts
interface ExternalActorRef {
  externalAccountId?: string;
  externalLogin?: string;
  displayName?: string;
  raw?: unknown;
}

interface ImportedTaskInput {
  externalId: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  labels?: string[];
  assignees?: ExternalActorRef[];
  sourceUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  raw?: unknown;
}

interface ImportedCommentInput {
  externalId: string;
  externalTaskId: string;
  body: string;
  author?: ExternalActorRef;
  createdAt: string;
  updatedAt?: string;
  raw?: unknown;
}

interface ExportedCommentInput {
  localNoteId: NoteId;
  body: string;
  createdAt: string;
  updatedAt?: string;
  sourceUrl?: string;
}

interface ExportedTaskInput {
  localTaskId: TaskId;
  externalId?: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  labels: string[];
  assignees: ExternalActorRef[];
  sourceUrl?: string;
  comments: ExportedCommentInput[];
}

interface SyncProviderV3 {
  readonly name: string;
  readonly version: string;
  initialize(config: SyncProviderConfig): Promise<void>;
  shutdown(): Promise<void>;
  pull(binding: IntegrationBinding, project: Project): Promise<SyncProviderPullResultV3>;
  push(binding: IntegrationBinding, tasks: ExportedTaskInput[], project: Project): Promise<SyncProviderPushResult>;
}
```

### v3 boundary rules

- Providers must not consume or emit local `ActorId` values.
- Providers own external identity extraction only.
- The host/runtime owns local actor resolution, mapping persistence, and imported-content approval computation.
- `binding.options.actorMappings` is shared desired state, not provider-local runtime bookkeeping.
- Provider-local secrets, cursors, caches, and linkage internals remain outside synced core entities.

## Expected lifecycle

1. Load plugin module.
2. Validate registration and compatibility.
3. Call `initialize(...)` once before binding-driven sync operations.
4. For each applicable integration binding, call `pull(...)` and `push(...)` according to the binding strategy.
5. Call `shutdown()` during daemon stop/unload.

## Task and comment sync semantics

### v2 pull behavior

`SyncProviderPullResult.tasks` accepts `ExternalTask[]`. The runtime reconciles pulled tasks within the binding's project by `externalId`.

- Each pulled item is mapped through `mapToTask(external, project)`.
- When no local task with the same `externalId` exists, the runtime creates a new task in the bound project.
- When a matching local task exists, the runtime updates it only if the external item is newer by `updatedAt` (falling back to `createdAt` when `updatedAt` is absent).
- Task deletions are not inferred from pull results in the current implementation.

The runtime persists the pulled task's core fields, including mapped status, priority, labels, assignees, `externalId`, and `sourceUrl`. Task descriptions come from `ExternalTask.description`.

### v3 pull behavior

`SyncProviderPullResultV3.tasks` accepts `ImportedTaskInput[]` and `comments` accepts `ImportedCommentInput[]`.

In v3:

- providers return normalized external identity data with `ExternalActorRef`
- providers do not translate directly into local tasks or notes
- the host/runtime is responsible for actor creation/reuse, binding mapping updates, and approval-state computation

Imported timestamp semantics stay the same across v2 and v3:

- newly created local tasks preserve external `createdAt` when provided
- newly created local tasks preserve external `updatedAt` when provided
- if only one external task timestamp is provided, the runtime uses that timestamp for both local `createdAt` and `updatedAt`
- later pull updates preserve local `createdAt` and use external update timestamps for conflict resolution
- invalid timestamps fail the pull safely instead of being written into local task state

### Push path

`push(...)` must return a `SyncProviderPushResult`:

```ts
interface SyncProviderPushCommentLink {
  localNoteId: NoteId;
  externalCommentId: string;
  externalTaskId: string;
  sourceUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  raw?: unknown;
}

interface SyncProviderPushTaskLink {
  localTaskId: TaskId;
  externalId: string;
  sourceUrl?: string;
}

interface SyncProviderPushResult {
  commentLinks: SyncProviderPushCommentLink[];
  taskLinks: SyncProviderPushTaskLink[];
}
```

The runtime applies returned `taskLinks` first, writing back task linkage for pushed local tasks so later pull cycles deduplicate by `externalId`. Returning the same task link again is a no-op. Returning a conflicting task link for a task that is already linked to a different external item is treated as a runtime error.

The runtime then applies each returned comment link idempotently by attaching the canonical `sync:externalId:<externalCommentId>` tag to the referenced local note. Returning the same link again is a no-op. Returning a conflicting link for a note that is already linked to a different external comment is treated as a runtime error.

### Comment pull path

For v2, pulled comments are `ExternalComment[]` with string `author` values.

For v3, pulled comments are `ImportedCommentInput[]` with structured `author?: ExternalActorRef`.

In both cases, the runtime reconciles pulled comments with local notes using a snapshot model:

- comments with an `externalId` not present locally are created as new notes with a `sync:externalId:<value>` tag
- comments matching an existing local note are updated if the external `updatedAt` is newer than the local `createdAt`
- local synced notes whose external IDs are absent from the pull result are deleted

## Load-Time Enforcement

At plugin load time, call:

```ts
validateSyncProviderRegistration(registration)
```

Validation enforces:

- manifest shape and non-empty identity fields
- required provider lifecycle methods for the declared API version
- provider/manifest identity consistency (`name` + `version`)
- API-version compatibility against the host-supported version set

Validation errors use structured codes:

- `INVALID_MANIFEST`
- `INVALID_PROVIDER`
- `API_VERSION_MISMATCH`
- `IDENTITY_MISMATCH`

## Daemon Host Configuration

Daemon plugin host loads sync plugin modules from configured local module paths.

Resolution order:

1. `TODU_DAEMON_PLUGIN_PATHS` env var (comma-separated module paths)
2. legacy `TODUAI_DAEMON_PLUGIN_PATHS` env var
3. `daemon.plugins.paths` in config file (paths resolved relative to config file location)

Runtime behavior:

- Plugin loading occurs at daemon startup.
- Path/config changes apply on daemon restart.
- Duplicate path entries are tolerated and logged; first occurrence wins.

Per-plugin scheduler config can be provided via `daemon.plugins.config.<pluginName>` in config file, `TODU_DAEMON_PLUGIN_CONFIG`, or legacy `TODUAI_DAEMON_PLUGIN_CONFIG` (JSON object). Supported fields:

- `intervalSeconds`: steady-state cycle interval
- `retryInitialSeconds` / `retryMaxSeconds`: retry backoff controls
- `enabled`: optional execution toggle for the local provider worker
- `settings`: provider-specific object passed to `initialize(...)`

Binding desired state is no longer configured through local plugin config. The daemon host enumerates shared integration bindings from core state, filters by provider name and `enabled` state, and executes provider work according to each binding's `strategy`, `projectId`, `targetKind`, `targetRef`, and optional `options` object.

Architecture note: the generic integration direction in `docs/architecture/integrations.md` moves project-to-external integration binding desired state into synced core data. In that model, local provider config remains the place for secrets, credentials, retry tuning, and other host-local runtime settings. `binding.options` is for provider-specific desired-state configuration only and must not be used for secrets or runtime internals.

Retry policy:

- pull/push cycle failures are logged and retried with exponential backoff
- delay formula is `retryInitialSeconds * 2^attempt`, capped by `retryMaxSeconds`
- retry state resets after a successful cycle
- daemon shutdown stops further scheduling and calls provider `shutdown()`

## Conflict Resolution Baseline

Provider sync conflict resolution baseline is `last-write-wins` based on `updatedAt` timestamps. Providers should preserve external timestamps where available and provide deterministic mapping behavior under repeated pull/push runs.
