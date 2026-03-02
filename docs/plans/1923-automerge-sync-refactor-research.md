# Task #1923: Automerge Sync Refactor Research (Planning Snapshot)

## Context

This is a greenfield project (not in production, single primary user). We are optimizing for a clean long-term architecture now.

---

## Decisions Locked So Far

1. **Daemon-per-machine model**
   - Every machine running todu has a local daemon.
   - This includes user devices (MacBook, Mac mini, Arch) and k3s.

2. **CLI and Electron are thin clients**
   - They should talk to the local daemon.
   - They should not directly own persistent Automerge storage.

3. **Fail-fast when daemon is unavailable**
   - No silent fallback mode.

4. **Join is transactional with strict rollback**
   - Join failures must not leave clients on a reset/new catalog path.

5. **Recurring should be a plugin/worker capability**
   - Not special-cased core runtime behavior.
   - It can run on whichever daemon is configured for it.

6. **Worker assignment is by integration/worker type, not per-project examples**
   - Example shape: one `github-sync` worker handles all configured GitHub sync scope.
   - Another `forgejo-sync` worker can run on a different daemon.
   - Avoid project-scoped examples in docs to prevent future confusion.

7. **No lease system for initial design**
   - Start with static assignment/configuration first.
   - Revisit lease-based coordination only if needed later.

8. **Rollout/implementation sequencing is deferred for now**
   - Still in planning and architecture decision mode.

---

## Architecture Direction (Current)

## Local topology

- **1 local daemon per machine** acts as local state owner/coordinator.
- **CLI/Electron** act as local clients only.

## Cross-device topology

- Replication uses Automerge sync relay.
- k3s can host always-on services (relay and one or more worker-enabled daemons).

---

## Worker/Plugin Model

Treat automation capabilities as pluggable workers attached to daemons by config.

Examples of worker types:
- `recurring`
- `github-sync`
- `forgejo-sync`

Important: assignment is by worker type/integration capability, not by per-project partition examples.

---

## Coordination Model (Initial, No Leases)

Use static assignment and policy:

- A worker type is configured to run on specific daemon(s).
- Non-assigned daemons do not run that worker type.
- Failover is manual by updating assignment/config.

This keeps initial complexity low while preserving deployment flexibility.

---

## Join Policy (Required Behavior)

Join flow must be fail-safe:

1. Validate join code
2. Verify target reachability
3. Snapshot current pointer/state
4. Atomic switch
5. Reconnect
6. Roll back on failure

No implicit "create new catalog" behavior on failed join attempts.

Bootstrap vs join distinction:
- **Bootstrap (first run, no marker/catalog yet):** creating an initial catalog is allowed.
- **Join (explicitly switching to another catalog ID):** creating a new catalog as fallback is not allowed.

### Example: Authority migration from Mac mini daemon to k3s daemon

1. Read current catalog ID from Mac mini daemon (`daemon.status` / sync status surface).
2. Ensure shared Automerge relay is running and Mac mini daemon is connected.
3. Start k3s daemon and run explicit join using that catalog ID.
4. k3s daemon performs transactional join (validate/reachability/switch/rollback on failure).
5. Verify both daemons report the same catalog ID.
6. Reassign worker types (e.g., recurring, github-sync) via explicit config updates in each host/context.

---

## Catalog Consistency Principle

Goal: all clients should replicate the same Automerge document graph for a user dataset.

Practical rule: clients should converge on the same catalog document ID and referenced sub-doc graph.

---

## Planning Status of Previously Open Questions

1. **Worker assignment config location**
   - Initial approach: local config file and/or environment variables.

2. **Duplicate assignment detection (no leases)**
   - Initial approach: keep simple for now.
   - Start with error logging/observability only.
   - Treat stronger prevention as a future enhancement.

3. **Exact daemon-client API/transport contract**
   - **Resolved in planning**.
   - Transport: UDS on mac/linux (with abstraction for future Windows support).
   - Connection model: Electron persistent connection; CLI short-lived per invocation.
   - Protocol: JSON-RPC-style envelope (request/result/error + event frames) with stable error taxonomy.
   - Handshake: `daemon.hello` with protocol/version/capabilities/role/catalog context.
   - Events: `events.subscribe` / `events.unsubscribe` with best-effort delivery (clients re-fetch after reconnect).
   - Local trust model: UDS file permissions as primary gate; no separate auth token initially.
   - Timeout/retry policy:
     - CLI: connect timeout 1s, request timeout 10s, no retries, fail-fast on unavailable daemon.
     - Electron: connect timeout 2s, reconnect backoff 250ms → 500ms → 1s → 2s (cap 2s); on reconnect, re-hello + re-subscribe + refresh.
     - Daemon: bounded per-request execution timeout (target 30s cap) returning `TIMEOUT` on overrun.
   - Initial implemented namespaces: `daemon.*`, core domain namespaces, `events.*`, and `worker.status`.
   - Remaining `worker.*` control methods stay unsupported and return `UNSUPPORTED_CAPABILITY` until implemented.

4. **Operational UX for manual worker reassignment/failover**
   - **Resolved in planning (initial model)**.
   - CLI targets one daemon per invocation (local daemon only).
   - No cross-daemon fanout in a single command.
   - Multi-daemon failover is explicit: run CLI in each host/context and apply config changes in sequence.
   - Keep this model simple and document it clearly.

5. **Core domain ↔ worker/plugin interaction model**
   - **Resolved in planning (initial model)**.
   - Core domains remain usable without workers; workers add automation, not base CRUD/read behavior.
   - Workers must declare required domain capabilities; daemon blocks worker start when required domains are disabled/missing.
   - Recurring without worker: templates still usable, and manual occurrence generation should be available.
   - Habit without worker: manual check-in, history, and streak computation still work.
   - Capability gating must surface clear status/errors when a worker depends on a disabled core domain.

---

## Rollout / Implementation Sequencing (Agreed)

### Phase 1 — Protocol + daemon foundation
- Implement daemon process skeleton.
- Implement UDS transport.
- Implement `daemon.hello`, `daemon.status`, `daemon.ping`.
- Add protocol tests (envelope, errors, handshake, version mismatch).

Gate: daemon starts, responds, and reports protocol/capabilities reliably.

### Phase 2 — Core domain RPC surface
- Expose existing core namespaces over daemon (`project/task/label/note/recurring/habit/sync`).
- Add `events.subscribe` / `events.unsubscribe`.
- Emit `data.changed` and `sync.statusChanged`.

Gate: daemon path reaches behavior parity with existing SDK operations.

### Phase 3 — CLI migration to thin client
- Switch CLI to daemon-only UDS path.
- Enforce fail-fast behavior when daemon is unavailable.
- Remove CLI probe/fallback ownership logic.

Gate: CLI behavior is stable in daemon mode with clear fail-fast UX.

### Phase 4 — Electron migration to thin client
- Switch Electron to persistent daemon connection.
- Implement reconnect backoff + re-hello + re-subscribe + refresh.
- Remove direct persistent storage ownership from Electron runtime.

Gate: Electron + CLI concurrent usage converges through local daemon coordination.

### Phase 5 — Join safety refactor
- Explicitly separate bootstrap vs join paths.
- Implement transactional join with strict rollback.
- Remove failed-join fallback that creates a fresh catalog in join flow.

Gate: failed join preserves prior dataset; bootstrap still creates initial catalog correctly.

### Phase 6 — Worker/plugin framework (minimal)
- Add worker registration model with domain/capability dependency declarations.
- Add capability gating: workers blocked if required domains are disabled/missing.
- Keep `worker.*` protocol namespace reserved; implement minimal lifecycle/status as needed.

Gate: worker availability/dependency state is visible via status/logging.

### Phase 7 — Recurring as plugin capability
- Remove recurring auto-processing from general client startup path.
- Implement recurring automation as a worker/plugin capability.
- Keep manual recurring occurrence generation path available.

Gate: no client-side recurring auto-run; recurring works via worker/manual flow.

### Phase 8 — Operational controls + documentation
- Implement static worker assignment via config (local file/env).
- Provide CLI-driven manual reassignment flow (single-daemon per invocation).
- Document authority migration and per-host/context operational runbooks.

Gate: repeatable failover/reassignment process documented and testable.

## Summary

Current planning direction is:
- daemon on every machine,
- thin CLI/Electron clients,
- fail-fast client behavior,
- transactional join with rollback,
- recurring as a normal plugin/worker capability,
- static worker-type assignment first (no leases yet).