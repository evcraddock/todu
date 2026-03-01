# Phase 5: Join Safety Refactor (Bootstrap vs Join)

> Make catalog join fail-safe, transactional, and daemon-owned.

## Overview

Refactor catalog switching so bootstrap and join are explicit, separate flows. Join operations must be transactional with strict rollback on failure. Client apps invoke join through daemon APIs only.

## Goals

- Separate first-run bootstrap from join semantics
- Eliminate implicit "create fresh catalog" fallback in failed join path
- Centralize join safety in daemon/engine layers
- Provide clear user interfaces in Electron and CLI

## Scope

### Deliverables

1. **Explicit bootstrap path**
   - Initial catalog creation only when no marker/catalog exists
   - Storage API: `initBootstrapStorage(...)`

2. **Explicit join path**
   - Catalog switch operation that never falls back to fresh catalog creation
   - Storage API: `initJoinStorage(...)`

3. **Transactional join execution**
   - Validate join code
   - Verify target reachability
   - Snapshot current pointer/state
   - Atomic switch
   - Roll back on failure
   - Storage entrypoint for switch/rollback scaffolding: `beginCatalogJoinSwitch(...)`

4. **Daemon-owned join API**
   - Join logic implemented in engine/storage and invoked via daemon method
   - Clients do not write marker files directly

5. **Error/status semantics**
   - Clear join failure reasons (`JOIN_FAILED`, validation/reachability details)
   - Return prior/target catalog context in result/details where safe

6. **Test coverage**
   - Failed join preserves current dataset
   - Bootstrap still creates initial catalog correctly
   - Successful join converges to target catalog ID
   - Authority migration scenario (e.g., Mac mini daemon → k3s daemon)

## User Interface / UX

### Electron UX

Settings → Sync:
- Show current catalog ID
- Join input field
- `Validate` action (format + reachability only)
- `Join` action (transactional switch with confirmation)

On failure:
- show explicit error
- dataset remains unchanged

Implementation note:
- Electron Settings uses daemon `sync.join` for both validate and join actions.
- Electron no longer writes catalog marker files directly.

### CLI UX

- `toduai sync status` — show daemon/catalog state
- `toduai sync join <catalogId> --check` — validation only
- `toduai sync join <catalogId>` — interactive confirmation + join
- `toduai sync join <catalogId> --yes` — non-interactive mode

CLI output should clearly indicate:
- previous catalog ID
- target catalog ID
- success or rollback outcome

Implementation note:
- `toduai sync join <catalogId> --check` calls daemon `sync.join` with `check=true`
- `toduai sync join <catalogId>` performs validation first, prompts for confirmation, then calls daemon `sync.join`
- `--yes` skips confirmation for non-interactive flows

### Daemon join API behavior (Phase 5 implementation)

Daemon exposes `sync.join` with params:
- `catalogId` (required string)
- `check` (optional boolean, default `false`)

Behavior:
- `check=true`: validation-only path (format + reachability), no catalog pointer switch
- `check=false`: transactional switch path using marker snapshot + rollback on failure

Result shape:
- `mode`: `check` | `join`
- `previousCatalogId`
- `targetCatalogId`
- `switched`
- `rolledBack`

### Join error semantics

Join failures return `JOIN_FAILED` with structured details:
- `stage=validate-format` for malformed join codes
- `stage=validate-reachability` when target catalog cannot be loaded
- `stage=switch` when transactional switch fails and rollback restores previous catalog
- `stage=rollback-restore` when switch fails and runtime recovery also fails

Details include relevant catalog IDs (`previousCatalogId`, `targetCatalogId`) and failure context (`cause`/`restoreError`) for operator troubleshooting.

### Host/context rule

Join is per daemon instance, not per app.

- Running join once via CLI against a machine's daemon is sufficient for both CLI and Electron on that machine.
- Repeat only on other machines/contexts that have separate daemon instances.

## Requirements

### Implementation placement

- Join transaction implemented in engine/storage layer
- Daemon exposes join method and calls engine transaction
- Clients are thin invokers only

### Safety constraints

- No implicit fresh-catalog fallback in join path
- Rollback must preserve prior pointer/state on any failure after snapshot

## Acceptance Criteria

- [ ] Bootstrap and join paths are explicitly separated
- [ ] Join logic is daemon-owned; clients do not mutate marker directly
- [ ] Failed join always preserves existing dataset
- [ ] Successful join switches to target catalog ID
- [ ] Electron and CLI UX flows are available as specified
- [ ] Join behavior is covered by automated tests

## Non-Goals

- Worker/plugin lifecycle design
- Recurring automation migration
- Multi-daemon fanout join orchestration

## Dependencies

- Phase 1 daemon/protocol foundation
- Phase 2 core RPC surface + parity
- Phase 3/4 client thin-client migrations (recommended before full UX rollout)

## Task Decomposition and Documentation Requirements

All tasks derived from this phase must follow:

- `docs/plans/TASK_EXECUTION_STANDARD.md`

Minimum task context must include:
- `docs/ARCHITECTURE.md`
- `docs/plans/1923-automerge-sync-refactor-research.md`
- This phase doc

Every task must include a documentation step in the same PR (or explicitly justify why no doc update is needed).

## Success Criteria

1. Join operations are safe by default
2. Users can migrate authority between hosts without data reset risk
3. Bootstrap remains simple while join remains transactional and explicit