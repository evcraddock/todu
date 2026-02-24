# Phase 4: Electron Thin-Client Migration

> Convert Electron runtime from local engine owner to persistent daemon client.

## Overview

Migrate Electron to daemon-first architecture by replacing direct engine/storage ownership with persistent daemon connectivity. Ensure UI reactivity and sync status behavior remain stable through reconnects.

## Goals

- Make Electron a strict thin client of local daemon
- Remove direct `createTodu()` ownership from Electron runtime path
- Preserve interactive UX with resilient reconnect behavior
- Maintain renderer reactivity via event subscriptions + refresh strategy

## Scope

### Deliverables

1. **Electron daemon connection manager (main process)**
   - Persistent UDS connection
   - Reconnect backoff: 250ms → 500ms → 1s → 2s (cap)
   - Re-handshake on reconnect (`daemon.hello`)
   - Re-subscribe on reconnect (`events.subscribe`)

2. **IPC-to-daemon routing migration**
   - Main process IPC handlers forward to daemon methods
   - Remove direct engine namespace calls in Electron runtime path

   Status update:
   - Electron main IPC handlers now invoke daemon RPC methods and map protocol errors to renderer Result shapes while preserving existing channel contracts.

3. **Runtime ownership removal**
   - Remove direct persistent storage ownership assumptions from Electron startup
   - Electron should no longer be local state owner

4. **Reactivity parity**
   - Preserve renderer invalidation/update behavior from daemon events
   - Maintain sync status indicators from `sync.statusChanged`

5. **Electron daemon-mode tests**
   - Integration tests against daemon harness
   - Reconnect recovery tests

## Requirements

### Connection Behavior

- Electron maintains one persistent daemon connection
- On disconnect, reconnect with bounded backoff
- On reconnect: re-hello, re-subscribe, refresh relevant state

#### Connection lifecycle notes

- Reconnect backoff schedule is fixed to `250ms → 500ms → 1s → 2s` (2s cap).
- Electron main-process daemon client exposes lifecycle hooks for:
  - connection established
  - reconnect established
  - disconnected
  - reconnect scheduled (with attempt + delay)
- Lifecycle hooks are intended to run reconnect recovery logic (re-hello, re-subscribe) in one place.

### UI Behavior

- Temporary daemon unavailability should degrade gracefully
- UI should recover automatically once connection returns

## Acceptance Criteria

- [ ] Electron startup succeeds using daemon connection path
- [ ] Core views operate without direct local engine ownership
- [ ] Reconnect behavior is implemented and tested
- [ ] Data and sync status updates remain reactive through event path
- [ ] No residual direct persistent-storage ownership in Electron runtime path

## Non-Goals

- Join flow transactional refactor
- Worker/plugin lifecycle implementation
- Recurring automation migration to plugin capability

## Dependencies

- Phase 1 protocol/daemon foundation
- Phase 2 core RPC surface + parity

## Task Decomposition and Documentation Requirements

All tasks derived from this phase must follow:

- `docs/plans/TASK_EXECUTION_STANDARD.md`

Minimum task context must include:
- `docs/ARCHITECTURE.md`
- `docs/plans/1923-automerge-sync-refactor-research.md`
- This phase doc

Every task must include a documentation step in the same PR (or explicitly justify why no doc update is needed).

## Success Criteria

1. Electron and CLI both operate as thin clients against local daemon
2. Local ownership and data coordination are centralized in daemon
3. Electron UX remains responsive and resilient during daemon restarts