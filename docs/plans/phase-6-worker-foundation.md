# Phase 6: Worker/Plugin Foundation + Capability Gating

> Introduce minimal worker runtime and enforce domain dependency boundaries.

## Overview

Implement the first worker/plugin runtime layer in daemon architecture. Focus on capability declarations, dependency gating, assignment configuration, and observable worker status.

## Goals

- Establish worker/plugin contract and lifecycle baseline
- Enforce domain dependency gating at daemon runtime
- Honor static worker assignment model (file/env)
- Expose worker state clearly for operations/debugging

## Scope

### Deliverables

1. **Worker/plugin registration contract**
   - Worker type/integration identity
   - Required domain capabilities
   - Optional domain capabilities (if applicable)
   - Role requirements (if applicable)

2. **Daemon worker lifecycle baseline**
   - Register/load workers
   - Start/stop control
   - Status reporting (`running`, `blocked`, `error`, etc.)

3. **Capability/dependency gating**
   - Validate required domains before worker start
   - Block worker startup if required domains disabled/missing
   - Return clear blocked reasons in status/logging/errors

4. **Static assignment integration**
   - Worker assignment via local file/env config
   - Non-assigned daemons do not run worker

5. **Observability baseline**
   - Log duplicate assignment issues (initial non-lease approach)
   - Surface worker state for operational inspection

6. **Protocol surface baseline**
   - Provide worker state visibility via daemon protocol.
   - Implement `worker.status` for status visibility.
   - Keep non-implemented worker control methods returning `UNSUPPORTED_CAPABILITY` until control APIs land.

### Baseline Worker Contract (Task #1950)

Worker manifests include:
- `type`
- `requiredDomains`
- `optionalDomains`
- `roleHints`

Canonical lifecycle states:
- `registered`
- `running`
- `blocked`
- `error`
- `stopped`

Daemon runtime registration/lifecycle entrypoints:
- `registerWorker(...)`
- `transitionWorkerState(...)`
- `getWorker(...)`
- `listWorkers()`

## Requirements

### Dependency Enforcement

- Worker startup checks are deterministic and explicit
- Missing dependency does not crash daemon; worker remains blocked with reason

### Assignment Behavior

- Assignment config is authoritative in initial model.
- Config file source: `daemon.workers.assigned`.
- Env override source: `TODUAI_DAEMON_ASSIGNED_WORKERS` (comma-separated), which takes precedence over file assignment.
- Duplicate assignment entries are logged clearly (prevention hardening deferred).

### Compatibility Behavior

- Core domains remain usable without workers
- Worker lifecycle must not alter baseline core CRUD/query behavior

## Phase 6 Gating Notes

- Required-domain checks run for workers loaded at daemon startup and for runtime registrations (reload-equivalent path).
- If a required domain is unavailable, the worker transitions to `blocked` with a deterministic blocked reason that lists missing/disabled domains.
- Attempting to transition a dependency-blocked worker to `running` returns a dependency-blocked error and keeps worker state `blocked`.

## Worker Status Protocol Contract (Initial)

- Method: `worker.status`
- Optional input: `params.workerType` (non-empty string) to query a single worker.
- Output includes:
  - `workers[]` entries with `type`, `state`, `blockedReason`, `errorMessage`, `updatedAt`
  - assignment context (`isAssigned` per worker and global assigned worker list)
  - dependency context (`missingRequiredDomains` per worker and enabled worker domains)
- Unknown worker requested via `params.workerType` returns `NOT_FOUND`.
- Non-implemented worker control methods remain unsupported and return `UNSUPPORTED_CAPABILITY`.

## Acceptance Criteria

- [x] Worker registration contract implemented
- [x] Daemon can register/start/stop workers in baseline lifecycle
- [x] Required-domain gating blocks incompatible worker startup
- [x] Blocked status/reasons are visible via protocol/logging
- [x] Static assignment config is honored
- [x] Duplicate assignment conditions are logged

## Implementation Notes

- Task #2114 completed the execution-plane baseline by requiring executable worker runtime registration (`manifest` + `runtime`), wiring daemon-driven worker start/stop lifecycle, and enforcing clean worker stop/restart across `sync.join` switch and rollback flows.
- Runtime failures during worker start/stop are surfaced as worker lifecycle `error` state with explicit error context (`START_FAILED`/`STOP_FAILED`).

## Non-Goals

- Lease-based worker coordination/election
- Full external integration implementation (GitHub/Forgejo behavior)
- Recurring automation migration itself (next phase)

## Dependencies

- Phase 1 daemon/protocol foundation
- Phase 2 core RPC surface + parity
- Phase 3/4 thin-client migrations recommended for operational consistency

## Task Decomposition and Documentation Requirements

All tasks derived from this phase must follow:

- `docs/plans/TASK_EXECUTION_STANDARD.md`

Minimum task context must include:
- `docs/ARCHITECTURE.md`
- `docs/plans/1923-automerge-sync-refactor-research.md`
- This phase doc

Every task must include a documentation step in the same PR (or explicitly justify why no doc update is needed).

## Success Criteria

1. Worker runtime is operationally visible and controllable
2. Domain/worker boundaries are enforced by runtime gating
3. Static assignment model is functional without introducing lease complexity