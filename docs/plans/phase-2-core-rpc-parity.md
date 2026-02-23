# Phase 2: Core Domain RPC Surface + Event Parity

> Build complete core-domain daemon method coverage before client migration.

## Overview

Expose existing engine domain capabilities through daemon protocol so CLI/Electron can migrate to thin-client mode without losing behavior. This phase focuses on parity and correctness, not UI/client migration.

## Goals

- Provide daemon RPC coverage for all core domain namespaces
- Preserve domain semantics through protocol error mapping
- Emit core change/status events consistently
- Establish parity confidence via automated tests

## Scope

### Deliverables

1. **Core namespace method surface**
   - `project.*`
   - `task.*`
   - `label.*`
   - `note.*`
   - `recurring.*`
   - `habit.*`
   - `sync.*`

2. **Result/Error translation layer**
   - Map engine `Result<T, E>` outcomes to protocol success/error frames
   - Ensure stable error code taxonomy is applied consistently

3. **Event parity wiring**
   - `data.changed`
   - `sync.statusChanged`
   - best-effort event semantics maintained

4. **Capability reporting**
   - `daemon.hello` reports supported method namespaces/capabilities

5. **Parity test suite**
   - Cross-check representative daemon calls against equivalent in-process engine behavior

## Requirements

### Method Behavior

- RPC methods must preserve core domain behavior and validation semantics
- No hidden behavior changes relative to existing engine operations

### Error Behavior

- Domain errors map to stable protocol error codes (`VALIDATION_ERROR`, `NOT_FOUND`, etc.)
- Unexpected failures map to `INTERNAL_ERROR`

### Event Behavior

- Data mutations emit `data.changed`
- Sync state transitions emit `sync.statusChanged`
- Subscriber disconnect/reconnect behavior remains best-effort

## Acceptance Criteria

- [ ] Core domain namespaces callable through daemon protocol
- [ ] Domain-level errors are mapped and test-verified
- [ ] `daemon.hello` capability reporting includes implemented namespace set
- [ ] `data.changed` and `sync.statusChanged` events are emitted and observable
- [ ] Parity tests pass for representative CRUD/query/sync status flows

## Non-Goals

- CLI migration to daemon thin-client mode
- Electron migration to daemon thin-client mode
- Join safety refactor (bootstrap vs transactional join)
- Worker/plugin lifecycle API implementation

## Dependencies

- Phase 1 daemon/protocol foundation complete
- Existing engine namespaces and tests from prior CLI work

## Task Decomposition and Documentation Requirements

All tasks derived from this phase must follow:

- `docs/plans/TASK_EXECUTION_STANDARD.md`

Minimum task context must include:
- `docs/ARCHITECTURE.md`
- `docs/plans/1923-automerge-sync-refactor-research.md`
- This phase doc

Every task must include a documentation step in the same PR (or explicitly justify why no doc update is needed).

## Success Criteria

1. Daemon method surface is functionally equivalent to current engine behavior
2. Client migration phases can begin without method-surface churn
3. Event contract is stable enough for persistent UI clients

## Progress Notes

### 2026-02-22 — Task #1934

- Added a namespace/method dispatch table in `packages/daemon/src/rpc.ts` for core namespaces:
  - `project`, `task`, `label`, `note`, `recurring`, `habit`, `sync`
- Added a single routing flow that resolves handlers by `<namespace>.<method>` with support for:
  - namespace-level handler registration (`namespaceHandlers`)
  - explicit method overrides (`methodHandlers`)
- Added fallback behavior for recognized-but-unimplemented core methods:
  - returns structured `UNSUPPORTED_CAPABILITY`
- Preserved unknown method behavior:
  - unrecognized methods still return structured `METHOD_NOT_FOUND`
- Extended runtime wiring to accept namespace handler registration via `rpcNamespaceHandlers`.
- Added routing coverage in tests:
  - `packages/daemon/src/rpc.test.ts`
  - `packages/daemon/src/runtime.test.ts`
  - `packages/daemon/src/protocol-conformance.test.ts`

### 2026-02-22 — Task #1935

- Added daemon RPC adapter handlers for `project.*`, `task.*`, `label.*`, and `note.*` in `packages/daemon/src/core-rpc-adapters.ts`.
- Wired adapters into runtime defaults so these namespaces are callable over daemon protocol without per-task manual registration.
- Added deterministic request-param validation (`BAD_REQUEST`) for missing/invalid adapter params.
- Added stable `Result<T, E>` → protocol mapping for adapted domains:
  - successful `Result` values map to protocol success frames
  - domain errors map through protocol error taxonomy (`NOT_FOUND`, `VALIDATION_ERROR`, etc.)
- Normalized void success results (`Result<void>`) to `result: null` to preserve protocol success envelope shape.
- Added/expanded runtime + conformance coverage for:
  - callable project/task/label/note methods
  - domain and request validation error mapping
  - unchanged fallback `UNSUPPORTED_CAPABILITY` behavior for still-unadapted namespaces (for example `recurring.*`).