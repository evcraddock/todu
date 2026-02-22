# Task #1923: Automerge Sync Refactor Research

## Goal
Research and propose a refactor approach for Automerge sync behavior:
- CLI ↔ Electron (same machine)
- Device ↔ Device (remote sync server)

---

## Current Architecture (Observed)

### Runtime modes in `createTodu()`
Source: `packages/engine/src/index.ts`

1. **Standalone owner**
   - Persistent repo (`NodeFSStorageAdapter`)
   - No local sync server
   - Optional remote sync adapter

2. **Electron owner**
   - Persistent repo (`NodeFSStorageAdapter`)
   - Starts local WebSocket sync server (`127.0.0.1:24377`) via `startSyncServer()`
   - Optional remote sync adapter

3. **CLI ephemeral client**
   - In-memory repo via `initEphemeralStorage()`
   - Connects to local server (`connectSyncClient()`)
   - Reads catalog ID from marker (`todu-catalog.id`)
   - No direct remote adapter management (remote is effectively owned by server process)

### Data model and document topology
Source: `packages/core/src/schema.ts`

- `CatalogDocument` (root): projects, labels, recurring templates, habits, doc ID indexes
- Per-project `TaskListDocument`
- Per-task `TaskDetailDocument`
- Global `NotesDocument`
- Per-habit `HabitLogDocument`

### Join flow (device B joins device A)
Sources: `packages/electron/src/main/ipc.ts`, `packages/engine/src/storage.ts`

- UI sends join code (catalog doc ID)
- Main process writes marker file: `<storage>/todu-catalog.id`
- App relaunches
- On startup, engine tries `repo.find(catalogId)` with 10s timeout
- If not reachable, marker is removed and a **new empty catalog** is created

---

## Sync Behavior Comparison: CLI vs Electron

### CLI
Source: `packages/cli/src/index.ts`

- On each command:
  - Loads config
  - Probes local sync server with `isSyncServerAvailable()` (200ms timeout)
  - If available: uses ephemeral client mode
  - If unavailable: opens persistent standalone repo directly
- `sync status` reports `managed by server` in ephemeral mode (`packages/cli/src/commands/sync.ts`)

### Electron
Sources: `packages/electron/src/main/index.ts`, `packages/electron/src/main/change-notifications.ts`

- Always starts in owner mode with local sync server enabled
- Optionally attaches remote sync adapter
- Pushes `todu:data:changed` and `todu:sync:status-changed` to renderer

### Key edge-case differences

1. **Mode selection race in CLI**
   - 200ms probe can miss a starting/loaded Electron server
   - CLI may fall back to standalone owner mode unexpectedly

2. **Lifecycle asymmetry**
   - Electron is long-lived owner
   - CLI is short-lived, frequently reconnecting ephemeral client

3. **Status surface mismatch**
   - `RemoteSyncState` includes `syncing`, `lastSync`, but code mostly toggles connected/disconnected only

---

## Multi-Device Consistency & Conflict Handling

### What is strong today

- CRDT merge semantics from Automerge across docs
- Deterministic recurring task IDs (`generateScheduledTaskId`) reduce duplicate recurring tasks across devices (`packages/engine/src/recurring.ts`)
- Idempotent habit check-ins keyed by date in habit log docs

### Important invariants implicitly relied on

1. Exactly one durable owner per local data dir at a time
2. Marker file always points to intended catalog
3. CLI ephemeral writes must flush before process exit
4. Recurring generation must remain idempotent across devices

### Main failure modes / risks

1. **Ephemeral flush is catalog-centric, not mutation-centric**
   - `initEphemeralStorage().close()` waits for sync flush on **catalog document ID only** (`packages/engine/src/storage.ts`)
   - But many writes occur on task list/detail/notes/habit docs
   - Risk: short-lived CLI exits before non-catalog doc sync is delivered

2. **Join failure can silently reset user to fresh catalog**
   - Invalid/unreachable join code after restart falls back to new catalog creation
   - This is operationally harsh for users

3. **Owner arbitration is implicit**
   - No explicit lock/lease around “who owns persistent storage” locally
   - Behavior depends on probe timing and process start order

4. **Config/docs drift**
   - Architecture doc still references `sync.server` while runtime uses `sync.remote.server`
   - Increases operator error during setup/debug

---

## Refactor Options

### Option A — Harden current model (lowest risk)

Keep architecture, improve correctness:
- Add mutation-aware flush barrier for ephemeral client close
- Add explicit local owner lock file/lease
- Make join flow transactional (validate reachability before committing marker switch)
- Normalize sync status semantics (`connected/disconnected/syncing`, `lastSync`)

**Pros:** low migration risk, incremental
**Cons:** retains complexity of mode switching heuristics

---

### Option B — Single local sync owner daemon (cleaner local topology)

- Introduce a persistent local sync owner process (`toduai serve` or embedded service)
- CLI always acts as ephemeral client (never direct persistent owner in normal dev)
- Electron either hosts owner or connects to owner process

**Pros:** removes probe ambiguity + dual-owner risk
**Cons:** operational overhead, bigger UX/process change

---

### Option C — Full sync orchestration layer in engine (heavier redesign)

- Create explicit `SyncCoordinator` abstraction with state machine
- Separate concerns: local transport, remote transport, join/import, status
- All clients use the same coordinator contract

**Pros:** best long-term clarity/testability
**Cons:** highest implementation and migration cost

---

## Recommended Direction

Recommend **Option A now**, with an intentional path toward B/C if needed.

Why:
- Fixes highest-risk correctness issues quickly
- Preserves current user workflow
- Creates clean seams for later topology simplification

---

## Proposed Phased Plan

### Phase 1: Correctness hardening

1. **Ephemeral flush fix**
   - Track changed document IDs in engine lifecycle
   - On close, wait for sync-message generation/delivery for all changed docs (or robust repo-level idle barrier)

2. **Join safety**
   - Validate join target reachability before replacing marker
   - Keep rollback path (previous marker backup)
   - Distinguish invalid code vs temporary server unavailable

3. **Status contract cleanup**
   - Define transitions and set `lastSync` on successful exchange
   - Use `syncing` meaningfully or remove it

### Phase 2: Ownership clarity

4. **Local owner lock/lease**
   - Prevent concurrent persistent owners on same storage path
   - CLI fallback behavior becomes explicit and safe

5. **Mode decision observability**
   - Emit structured logs/diagnostics: why CLI chose ephemeral vs standalone

### Phase 3: Documentation and migration hygiene

6. **Config/docs alignment**
   - Standardize on `sync.remote.server` everywhere

7. **Operational playbook**
   - Troubleshooting for join, remote connectivity, and local owner conflicts

---

## Suggested Test Strategy

### Engine integration tests (critical)

1. **Ephemeral close flush across non-catalog docs**
   - Client updates task detail doc only
   - Immediate close
   - Server must observe update reliably

2. **Join transactional behavior**
   - Invalid join code does not destroy existing local marker/data
   - Temporary remote unavailability does not force empty catalog reset

3. **Owner lock tests**
   - Second persistent owner on same storage path fails fast with clear error

4. **Remote status transitions**
   - connected → syncing → connected/disconnected transitions validated
   - `lastSync` monotonic updates

### Cross-client scenario tests

5. **Electron owner + repeated CLI ephemeral writes**
   - Burst operations on tasks/notes/habits
   - No dropped writes

6. **Standalone CLI + remote relay + second device**
   - Conflicting edits merge deterministically
   - Recurring generation does not duplicate (deterministic ID invariant)

### Regression coverage

7. Existing tests to preserve:
   - `packages/engine/src/sync.test.ts`
   - `packages/engine/src/remote-sync.test.ts`
   - `packages/engine/src/sync-status.test.ts`
   - Electron integration flows under `integration-tests/`

---

## Notable Coupling Points to Refactor First

- `createTodu()` currently mixes topology selection, adapter lifecycle, scheduling startup, prefetch, and sync status wiring (`packages/engine/src/index.ts`)
- Marker-file ownership and join semantics are split between engine storage and Electron IPC restart flow (`storage.ts` + `ipc.ts`)
- CLI mode decision is tightly coupled to a short timeout probe (`cli/src/index.ts`)

---

## Conclusion

Current architecture is directionally solid (Automerge for both local and remote sync), but correctness depends on implicit assumptions. The highest value refactor is to make those assumptions explicit and enforced:
- durable flush semantics for ephemeral clients,
- transactional join behavior,
- explicit local ownership,
- and a precise sync status contract.

That gives a safe base for broader topology simplification later.