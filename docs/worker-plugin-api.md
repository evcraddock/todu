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

- `capabilities?.awaitableStop` — explicit host support for asynchronous worker completion. Check for `true` before creating an async-stop runtime; missing/false means an older or unsupported host.
- `getTodu()` — returns active daemon-owned todu host (or `null` if unavailable).
- `logger` — daemon logger interface for plugin logging.
- `config` — plugin settings object (`daemon.plugins.config.<pluginName>`).

## Runtime Lifecycle

- Plugin module loads at daemon startup.
- Daemon validates plugin registration before worker registration.
- Daemon registers worker using plugin-provided worker manifest.
- Daemon starts/stops worker using normal worker lifecycle and gating.
- Plugin can be installed/removed without daemon/core package dependency changes.

### Awaitable stop opt-in

A handle's `stop()` returns `void` for legacy synchronous cleanup or a `Promise<void>` for completion-aware cleanup. Existing synchronous plugins need no capability check or changes, but must release their resources before returning. An async-stop implementation must first verify `context.capabilities?.awaitableStop === true` in `createRuntime`, before allocating timers or starting work. On unsupported hosts, refuse activation with a clear error or provide a genuinely synchronous fallback; returning a promise that an older host ignores is not safe negotiation.

```ts
createRuntime(context) {
  if (context.capabilities?.awaitableStop !== true) {
    throw new Error("This worker requires awaitable-stop host support");
  }
  return {
    start() {
      // Start work and track its completion; do not allocate more work after stop.
      return {
        async stop() {
          // Cancel future scheduling, await admitted work, then release resources.
        },
      };
    },
  };
}
```

The host requests stop for all active workers, waits for their returned completions and admitted RPC handlers, and only then closes the engine. Pending asynchronous stops retain their current worker snapshot until completion; the synchronous `transitionWorkerState` result is not a completion receipt. Repeated stop requests share completion. Reactivation or conflicting transitions while cleanup is pending are rejected; failed cleanup remains visible and prevents reuse or a dataset switch rather than opening another engine over unconfirmed storage.

Reject the stop promise on cleanup failure. Do not swallow rejection, detach untracked cleanup, or force process exit. The existing direct CLI deadline remains unchanged; an uncooperative worker/provider may still exhaust it and fail. This capability does not add a universal abort signal, remote durability guarantee, or cancellation of arbitrary third-party work. The host cannot discover background work a legacy plugin hides after a synchronous return.

## Configuration

Plugin module paths resolve in this order:

1. `TODU_DAEMON_PLUGIN_PATHS` env var
2. `daemon.plugins.paths` in config file

Plugin settings resolve in this order:

1. `TODU_DAEMON_PLUGIN_CONFIG` env var
2. `daemon.plugins.config` in config file

Both changes apply on daemon restart. Configured local filesystem paths must be absolute or start with `.`; other values are treated as npm package specifiers.

For the published recurring worker package, see [Recurring Worker Installation](recurring-worker-installation.md).
