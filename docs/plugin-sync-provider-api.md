# SyncProvider API (Plugin Author Guide)

This document defines the external sync plugin contract exported by `@todu/core`.

For generic daemon worker plugins, see `docs/worker-plugin-api.md`.

## Purpose

`SyncProvider` is the runtime contract for plugins that synchronize todu data with external systems (for example, GitHub or Forgejo issue trackers).

This document defines the provider execution contract. Shared integration binding desired state is a separate architecture concern owned by core and documented in `docs/architecture/integrations.md`.

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

- Host-supported provider API version: `SYNC_PROVIDER_API_VERSION` (currently `1`).
- Every provider manifest must declare `apiVersion`.
- Providers are loadable only when `manifest.apiVersion` matches the host-supported API version.
- Version mismatches must fail at load time.

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

## Provider Lifecycle Contract

```ts
interface SyncProvider {
  readonly name: string;
  readonly version: string;
  initialize(config: SyncProviderConfig): Promise<void>;
  shutdown(): Promise<void>;
  pull(binding: IntegrationBinding, project: Project): Promise<SyncProviderPullResult>;
  push(binding: IntegrationBinding, tasks: TaskPushPayload[], project: Project): Promise<void>;
  mapToTask(external: ExternalTask, project: Project): Task;
  mapFromTask(task: TaskPushPayload, project: Project): ExternalTask;
}
```

`TaskPushPayload` extends `TaskWithDetail` with `comments: Note[]`, providing each task's description and attached comments during push.

Expected lifecycle:

1. Load plugin module.
2. Validate registration and compatibility.
3. Call `initialize(...)` once before binding-driven sync operations.
4. For each applicable integration binding, call `pull(...)` and `push(...)` according to the binding strategy.
5. Call `shutdown()` during daemon stop/unload.

## Comment Sync Contract

The sync-provider runtime supports comment/note mirroring through pull and push paths.

### Push path

Each `TaskPushPayload` in `push(...)` includes a `comments: Note[]` array containing the task's attached notes (entity type `task`). Providers can use these to detect local comment creates, edits, and deletes by comparing with external state.

### Pull path

`SyncProviderPullResult.comments` accepts `ExternalComment[]`. The runtime reconciles pulled comments with local notes using a snapshot model:

- Comments with an `externalId` not present locally are created as new notes with a `sync:externalId:<value>` tag.
- Comments matching an existing local note (by external ID tag) are updated if the external `updatedAt` is newer than the local `createdAt` (last-write-wins).
- Local synced notes whose external IDs are absent from the pull result are deleted.

### ExternalComment

```ts
interface ExternalComment {
  externalId: string;
  externalTaskId: string;
  body: string;
  author?: string;
  createdAt: string;
  updatedAt?: string;
  raw?: unknown;
}
```

The `externalTaskId` must match a todu task ID for the comment to be applied. The `createdAt` timestamp is required; `updatedAt` is used for conflict resolution when present (falls back to `createdAt`).

## Load-Time Enforcement

At plugin load time, call:

```ts
validateSyncProviderRegistration(registration)
```

Validation enforces:

- manifest shape and non-empty identity fields,
- required provider lifecycle methods,
- provider/manifest identity consistency (`name` + `version`),
- API-version compatibility.

Validation errors use structured codes:

- `INVALID_MANIFEST`
- `INVALID_PROVIDER`
- `API_VERSION_MISMATCH`
- `IDENTITY_MISMATCH`

## Daemon Host Configuration

Daemon plugin host loads sync plugin modules from configured local module paths.

Resolution order:

1. `TODUAI_DAEMON_PLUGIN_PATHS` env var (comma-separated module paths)
2. `daemon.plugins.paths` in config file (paths resolved relative to config file location)

Runtime behavior:

- Plugin loading occurs at daemon startup.
- Path/config changes apply on daemon restart.
- Duplicate path entries are tolerated and logged; first occurrence wins.

Per-plugin scheduler config can be provided via `daemon.plugins.config.<pluginName>` in config file or `TODUAI_DAEMON_PLUGIN_CONFIG` env var (JSON object). Supported fields:

- `intervalSeconds`: steady-state cycle interval.
- `retryInitialSeconds` / `retryMaxSeconds`: retry backoff controls.
- `enabled`: optional execution toggle for the local provider worker.
- `settings`: provider-specific object passed to `initialize(...)`.

Binding desired state is no longer configured through local plugin config. The daemon host now enumerates shared integration bindings from core state, filters by provider name and `enabled` state, and executes provider work according to each binding's `strategy`, `projectId`, `targetKind`, and `targetRef`.

Architecture note: the generic integration direction in `docs/architecture/integrations.md` moves project-to-external integration binding desired state into synced core data. In that model, local provider config remains the place for secrets, credentials, retry tuning, and other host-local runtime settings.

Retry policy:

- Pull/push cycle failures are logged and retried with exponential backoff.
- Delay formula is `retryInitialSeconds * 2^attempt`, capped by `retryMaxSeconds`.
- Retry state resets after a successful cycle.
- Daemon shutdown stops further scheduling and calls provider `shutdown()`.

## Conflict Resolution Baseline

Provider sync conflict resolution baseline is `last-write-wins` based on `updatedAt` timestamps. Providers should preserve external timestamps where available and provide deterministic mapping behavior under repeated pull/push runs.
