# SyncProvider API (Plugin Author Guide)

This document defines the external sync plugin contract exported by `@todu/core`.

## Purpose

`SyncProvider` is the runtime contract for plugins that synchronize todu data with external systems (for example, GitHub or Forgejo issue trackers).

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
  pull(project: Project): Promise<SyncProviderPullResult>;
  push(tasks: Task[], project: Project): Promise<void>;
  mapToTask(external: ExternalTask, project: Project): Task;
  mapFromTask(task: Task, project: Project): ExternalTask;
}
```

Expected lifecycle:

1. Load plugin module.
2. Validate registration and compatibility.
3. Call `initialize(...)` once before sync operations.
4. Call `pull(...)` and `push(...)` according to scheduler/strategy.
5. Call `shutdown()` during daemon stop/unload.

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

## Conflict Resolution Baseline

Provider sync conflict resolution baseline is `last-write-wins` based on `updatedAt` timestamps. Providers should preserve external timestamps where available and provide deterministic mapping behavior under repeated pull/push runs.
