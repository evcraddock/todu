# todu Architecture (Current)

> Canonical architecture for the daemon-first design.
>
> Supersedes prior architecture draft in `docs/archive/ARCHITECTURE.legacy.md`.

## Status

This document reflects the current architecture decisions from planning task #1923.

Project context:
- Greenfield
- Not in production
- Architecture optimized for long-term clarity over short-term backward compatibility

---

## Core Architecture Decisions

1. **Daemon per machine**
   - Every machine running todu has a local daemon process.
   - Includes user devices and always-on infrastructure (e.g., k3s).

2. **CLI/Electron are thin clients**
   - Clients talk to local daemon only.
   - Clients do not own persistent Automerge storage directly.
   - Electron main runtime must not initialize local engine ownership paths (for example, no `createTodu()` startup ownership in Electron main process).

3. **Fail-fast client behavior**
   - If local daemon is unavailable, clients fail with clear instructions.
   - No silent fallback ownership mode.

4. **Transactional join with rollback**
   - Join failures never implicitly create a fresh catalog.
   - Join and bootstrap are explicitly separate flows.

5. **Workers/plugins provide automation**
   - Core domains remain usable without workers.
   - Workers add automation capability (recurring, external sync, etc.).

6. **Initial coordination model: static assignment (no leases)**
   - Worker placement is configured.
   - Duplicate assignment prevention starts with observability/logging.
   - Strong coordination/lease system can be added later if needed.

---

## Topology

## Local (per machine)

- `todu daemon` is the local state owner/coordinator.
- `toduai` CLI and Electron connect to daemon via local transport.

```
CLI  ──┐
       ├──> local daemon (owns storage + sync adapters)
Electron┘
```

## Cross-device

- Replication uses Automerge relay.
- Daemons on different machines replicate via relay.

```
daemon(A) <--> relay <--> daemon(B) <--> relay <--> daemon(C)
```

## Automation placement

- Workers/plugins attach to daemons by configuration.
- Assignment is by worker type/integration capability.
  - Example: one `github-sync` worker handles configured GitHub scope.
  - Example: one `forgejo-sync` worker may run on another daemon.

---

## Storage and Catalog Model

- Dataset is rooted by a catalog document ID.
- All clients/daemons for the same dataset should converge on the same catalog ID and referenced sub-document graph.

### Notes storage partitioning

Notes are partitioned into multiple Automerge documents instead of one global notes document.

- Catalog keeps `notesBucketDocIds` (bucket key → document ID).
- Catalog keeps `noteBucketByNoteId` (note ID → bucket key) for direct update/delete lookup.
- Bucket selection:
  - Entity-attached notes use `entity:<type>:<entityId>`.
  - Standalone journal notes use monthly buckets `journal:<YYYY-MM>`.

This keeps write contention localized and bounds per-document history growth as note volume increases.

Diagnostics: set `TODU_NOTES_DIAGNOSTICS=1` to log notes bucket usage and legacy migration counts during engine operations.

### Bootstrap vs Join

- **Bootstrap** (first run, no marker/catalog): creating initial catalog is allowed.
- **Join** (explicit switch to another catalog ID): fail-safe transactional switch only.

### Join flow (required)

1. Validate join code format
2. Verify target reachability
3. Snapshot current pointer/state
4. Atomic switch
5. Reconnect
6. Roll back on failure

No implicit "create new catalog" fallback in failed join path.

---

## Daemon/Client Contract (v1)

## Transport

- Primary: **UDS** (macOS/Linux)
- Must be abstracted for future Windows support (named pipes preferred)

## Connection model

- Electron: persistent connection
- CLI: short-lived connection per invocation

## Protocol envelope

JSON-RPC-style frames:
- request: `{ id, method, params }`
- success: `{ id, result }`
- error: `{ id, error: { code, message, details } }`
- event push: `{ event, payload, ts }`

## Handshake

- `daemon.hello` required at connect
- Includes protocol version, daemon version, role, capabilities, and catalog context

## Events

- `events.subscribe` / `events.unsubscribe`
- Initial events:
  - `data.changed`
  - `sync.statusChanged`
- Delivery is best-effort; clients re-fetch after reconnect

## Worker protocol baseline

- `worker.status` is available for worker lifecycle visibility.
- Response includes worker state, blocked/error reason fields, assignment inclusion, and dependency context.
- Non-implemented worker control methods (for example, `worker.start`) return `UNSUPPORTED_CAPABILITY` until control APIs are introduced.

## Error taxonomy (stable codes)

Includes at least:
- `PROTOCOL_MISMATCH`
- `BAD_REQUEST`
- `METHOD_NOT_FOUND`
- `UNSUPPORTED_CAPABILITY`
- `TIMEOUT`
- `DAEMON_UNAVAILABLE`
- `VALIDATION_ERROR`
- `NOT_FOUND`
- `CONFLICT`
- `PRECONDITION_FAILED`
- `JOIN_FAILED`
- `WORKER_NOT_ASSIGNED`
- `INTERNAL_ERROR`

## Timeouts/retry policy

- CLI: connect 1s, request 10s, no retries, fail-fast on unavailable daemon
- Electron: connect 2s, reconnect backoff 250ms → 500ms → 1s → 2s cap, then re-hello/re-subscribe/refresh
- Daemon: bounded per-request execution timeout (target 30s cap), return `TIMEOUT` on overrun

## Local trust model

- UDS file permissions are the primary security gate
- No separate token in initial implementation

---

## Domain and Worker Interaction

## Core domains

Core domains (project/task/label/integration/note/recurring/habit/sync) provide base model + CRUD/query behavior.

Core domains are usable even with zero workers installed.

## Workers/plugins

Workers add automation. They do not define baseline domain availability.

Each worker declares required domain capabilities. Daemon behavior:
- validate dependencies at start/config reload
- block worker start if required domains are disabled/missing
- expose blocked reason in status/logs/errors

Dependency gating semantics:
- Workers may register even when dependencies are unavailable; they are held in `blocked` state.
- Transitioning a dependency-blocked worker to `running` returns a dependency error and preserves `blocked` state.
- Block reasons must include the missing/disabled required domains in deterministic order.

Executable worker runtime contract:
- Worker registration includes both a manifest and executable runtime (`runtime.start()` returning a handle with `stop()`).
- Daemon start attempts to start all assigned + dependency-clear workers.
- Daemon stop and `sync.join` switch/rollback paths stop active workers before dataset teardown/switch, then restart eligible workers after successful reattachment.
- Worker start/stop runtime failures transition worker state to `error` with actionable error context.

Baseline worker lifecycle states are:
- `registered`
- `running`
- `blocked`
- `error`
- `stopped`

### Plugin contracts

- Generic worker plugins use `WorkerPluginRegistration` from `@todu/core` and export `workerPlugin`.
- Sync provider plugins use `SyncProviderRegistration` from `@todu/core` and export `syncProvider`.
- Plugin load paths validate registrations at load time before worker registration.
- Compatibility baseline for sync providers is API-version based (current provider API version: `1`).
- Daemon plugin module paths resolve from `TODUAI_DAEMON_PLUGIN_PATHS` first, then `daemon.plugins.paths` in config; config file paths resolve relative to config location.
- Plugin load activation occurs at daemon startup and applies on daemon restart.
- Conflict resolution baseline for provider sync is last-write-wins by `updatedAt`.
- Planned external integration architecture uses a small synced core integration binding model consumed by sync provider plugins, while provider runtime internals remain local to the authority daemon host. See `docs/architecture/integrations.md`.
- Author-facing contract details are documented in `docs/worker-plugin-api.md` and `docs/plugin-sync-provider-api.md`.
- Product/plugin boundary policy is documented in `docs/adr/0001-plugin-boundaries-and-data-ownership.md`, `docs/architecture/plugins.md`, and `docs/architecture/integrations.md`.

### Recurring behavior

- Recurring automation is a worker capability.
- Client startup paths (CLI/Electron/SDK bootstrap) do not auto-run recurring processing.
- Recurring templates support `missPolicy`:
  - `accumulate` (default) preserves existing catch-up behavior and materializes every due occurrence
  - `rollForward` materializes only the latest due occurrence and does not create backlog debt for missed earlier dates
- Templates without an explicit `missPolicy` are treated as `accumulate` for backward compatibility.
- Manual occurrence generation remains explicit and available regardless of `missPolicy`.
- Without recurring worker:
  - recurring templates remain usable as data
  - manual occurrence generation remains available

### Habit behavior

- Habit core functionality works without worker automation:
  - manual check-in/uncheck
  - history
  - streak computation

---

## Worker Assignment and Failover (Initial)

- Assignment configured via local config file/env vars.
- Config file model uses `daemon.workers.assigned` (list of worker types).
- Environment override uses `TODUAI_DAEMON_ASSIGNED_WORKERS` (comma-separated worker types) and takes precedence over file assignment.
- Empty assignment is allowed and means no local workers are assigned.
- Duplicate assignment entries are tolerated and logged for observability; first occurrence wins.
- No lease system initially.

## Operational failover UX

- CLI targets one local daemon per invocation
- No cross-daemon fanout in a single command
- Multi-daemon reassignment is explicit by running CLI in each host/context

---

## Implementation Sequencing

1. Protocol + daemon foundation
2. Core domain RPC surface + events
3. CLI migration to thin client
4. Electron migration to thin client
5. Join safety refactor (bootstrap/join split + rollback)
6. Worker/plugin framework (minimal)
7. Recurring automation as plugin capability
8. Operational controls + docs

See `docs/plans/1923-automerge-sync-refactor-research.md` for detailed phase gates.

---

## Legacy Reference

Prior architecture draft is preserved at:

- `docs/archive/ARCHITECTURE.legacy.md`

Use it for historical rationale only; this document is authoritative.