# Worker Plugin API (Plugin Author Guide)

This document defines the standalone worker plugin contract exported by `@todu/core`.

## Purpose

`WorkerPluginRegistration` allows plugins to register daemon workers without creating hard dependencies from daemon/core to plugin packages.

## Contract

```ts
interface WorkerPluginRegistration {
  manifest: {
    name: string;
    version: string;
    worker: {
      type: string;
      requiredDomains: WorkerPluginDomainCapability[];
      optionalDomains?: WorkerPluginDomainCapability[];
      roleHints?: WorkerPluginRoleHint[];
    };
  };
  createRuntime(context: WorkerPluginHostContext): WorkerPluginRuntime;
}
```

Export requirements:

- Module must export `workerPlugin`.
- `manifest.name` and `manifest.version` must be non-empty.
- `manifest.worker.type` must be non-empty.
- `requiredDomains` must contain only supported domain capability values.
- `createRuntime(context)` must return runtime object with `start()` and `stop()` handle.

Validation entry point:

```ts
validateWorkerPluginRegistration(workerPlugin)
```

## Host Context

`createRuntime(context)` receives:

- `getTodu()` — returns active daemon-owned todu host (or `null` if unavailable).
- `logger` — daemon logger interface for plugin logging.
- `config` — plugin settings object (`daemon.plugins.config.<pluginName>`).

## Runtime Lifecycle

- Plugin module loads at daemon startup.
- Daemon validates plugin registration before worker registration.
- Daemon registers worker using plugin-provided worker manifest.
- Daemon starts/stops worker using normal worker lifecycle and gating.
- Plugin can be installed/removed without daemon/core package dependency changes.

## Configuration

Plugin module paths resolve in this order:

1. `TODU_DAEMON_PLUGIN_PATHS` env var
2. `daemon.plugins.paths` in config file

Plugin settings resolve in this order:

1. `TODU_DAEMON_PLUGIN_CONFIG` env var
2. `daemon.plugins.config` in config file

Both changes apply on daemon restart.
