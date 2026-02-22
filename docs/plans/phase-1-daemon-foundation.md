# Phase 1: Daemon + Protocol Foundation

> New phase baseline for daemon-first architecture.

## Overview

Build the daemon-first foundation before migrating CLI/Electron behavior. This phase establishes local daemon runtime, transport, and protocol contracts that later phases depend on.

## Goals

- Introduce a local daemon process as the system entry point
- Define and enforce stable client/daemon protocol basics
- Establish local transport security and reliability
- Provide testable protocol guarantees for later client migrations

## Scope

### Deliverables

1. **Daemon runtime foundation**
   - Start/stop lifecycle
   - Health/status surface
   - Role reported in status (`node` / `authority`)

2. **Local transport (macOS/Linux)**
   - UDS listener
   - Socket path conventions
   - File permission handling (local trust model)

3. **Protocol baseline (v1)**
   - JSON-RPC-style envelope
   - Structured error envelope with stable codes
   - Handshake method: `daemon.hello`
   - Baseline methods: `daemon.status`, `daemon.ping`

4. **Event channel baseline**
   - `events.subscribe`
   - `events.unsubscribe`
   - Initial event framing contract (best-effort delivery semantics)

5. **Test harness and verification**
   - Envelope conformance tests
   - Handshake/version mismatch tests
   - UDS connectivity tests
   - Timeout/error mapping tests

## Requirements

### Protocol Envelope

Request:

```json
{ "id": "...", "method": "...", "params": { } }
```

Success response:

```json
{ "id": "...", "result": { } }
```

Error response:

```json
{ "id": "...", "error": { "code": "...", "message": "...", "details": { } } }
```

Event frame:

```json
{ "event": "...", "payload": { }, "ts": "..." }
```

### Handshake Baseline

- Client calls `daemon.hello`
- Daemon returns protocol/version/capabilities/role/catalog context
- Protocol incompatibility returns `PROTOCOL_MISMATCH`

### Timeout Baseline

- CLI-oriented connect/request timeout behavior is supported by contract
- Daemon enforces bounded request execution timeout and returns `TIMEOUT` on overrun

## Acceptance Criteria

- [ ] Daemon starts and binds to UDS endpoint reliably
- [ ] `daemon.hello` succeeds with expected fields
- [ ] `daemon.status` and `daemon.ping` are stable and tested
- [ ] Malformed/unsupported requests return structured protocol errors
- [ ] Version mismatch is handled explicitly via `PROTOCOL_MISMATCH`
- [ ] `events.subscribe` / `events.unsubscribe` methods are available
- [ ] Protocol conformance tests pass in CI

## Non-Goals

- CLI migration to daemon thin-client mode
- Electron migration to daemon thin-client mode
- Join flow refactor (bootstrap vs transactional join)
- Worker/plugin execution model
- Recurring migration to worker capability

## Dependencies

- Existing engine/domain behavior from completed CLI phase
- Canonical architecture decisions in `docs/ARCHITECTURE.md`

## Task Decomposition and Documentation Requirements

All tasks derived from this phase must follow:

- `docs/plans/TASK_EXECUTION_STANDARD.md`

Minimum task context must include:
- `docs/ARCHITECTURE.md`
- `docs/plans/1923-automerge-sync-refactor-research.md`
- This phase doc

Every task must include a documentation step in the same PR (or explicitly justify why no doc update is needed).

## Success Criteria

1. Daemon protocol is stable enough to build clients against
2. Protocol regressions are caught by automated tests
3. Subsequent migration phases can proceed without redesigning transport/envelope/handshake

## Progress Notes

### 2026-02-22 — Task #1926

- Added `@todu/daemon` package scaffold with build/typecheck/test wiring.
- Added daemon lifecycle shell:
  - `createDaemonRuntime` (start/stop/status/config)
  - `startDaemonProcess` (entrypoint lifecycle + signal handling hooks)
  - `toduai-daemon` entrypoint script for local development runs
- Runtime config/status now represent daemon role (`node` / `authority`).
- Scope intentionally excludes domain RPC method implementation and CLI/Electron migration.

### 2026-02-22 — Task #1927

- Added UDS transport listener implementation (`createUdsTransport`) in `packages/daemon/src/transport.ts`.
- Added socket path convention:
  - default socket path: `<storagePath>/daemon.sock`
  - optional override via runtime config / `TODUAI_DAEMON_SOCKET`
- Enforced local trust baseline with socket file mode `0600` after bind.
- Implemented startup safety behavior:
  - detect and remove stale socket files (existing socket path with no active listener)
  - refuse startup if socket path is active
  - refuse replacing non-socket files at socket path
- Implemented shutdown cleanup: closes listener and removes socket file.
- Added automated transport/runtime/process tests for bind/connect/permissions/stale handling/cleanup.

### 2026-02-22 — Task #1928

- Added protocol envelope primitives in `packages/daemon/src/protocol.ts`:
  - request, success, error, and event frame types
  - centralized protocol error taxonomy constants
  - helpers for success/error/event frame creation
- Added parser/validator for incoming request frames:
  - `parseProtocolRequestFrame`
  - `parseProtocolRequestJson`
- Added deterministic malformed-frame error handling:
  - invalid JSON => `BAD_REQUEST`
  - invalid frame/id/method/params => structured `BAD_REQUEST`
- Added centralized error mapping utility (`mapErrorToProtocolError`) with consistent mapping for:
  - existing domain errors (`not-found`, `validation`, `storage`)
  - protocol errors passthrough
  - timeout-like and unknown errors
- Added protocol unit tests in `packages/daemon/src/protocol.test.ts` for valid/invalid parsing and error mapping behavior.

### 2026-02-22 — Task #1929

- Added daemon RPC router in `packages/daemon/src/rpc.ts` with routable `daemon.hello` handshake handling.
- Implemented `daemon.hello` response surface with:
  - `protocolVersion`
  - `daemonVersion`
  - daemon `role`
  - deterministic capability reporting (`methods`, `events`)
  - catalog context (`catalog.id`)
- Implemented explicit handshake version compatibility check returning structured `PROTOCOL_MISMATCH` details (`expected`, `received`).
- Wired UDS transport connection handler to protocol router in daemon runtime so newline-delimited JSON requests are parsed and responded to over the daemon socket.
- Added handshake tests:
  - router unit tests in `packages/daemon/src/rpc.test.ts`
  - runtime UDS routing handshake verification in `packages/daemon/src/runtime.test.ts`.

### 2026-02-22 — Task #1930

- Added baseline daemon methods `daemon.ping` and `daemon.status` in `packages/daemon/src/rpc.ts`.
- `daemon.ping` now returns a stable health response (`ok`, `ts`) for liveness checks.
- `daemon.status` now returns baseline metadata for thin clients:
  - `protocolVersion`
  - `daemonVersion`
  - daemon `role`
  - runtime `state` and derived `healthy` flag
  - `startedAt`
  - transport endpoint metadata (`kind`, `path`, `mode`)
  - catalog context (`catalog.id`)
- Extended daemon RPC context wiring in runtime so status reflects current runtime and transport state.
- Expanded tests:
  - router unit coverage for `daemon.ping` and `daemon.status`
  - runtime UDS integration coverage for ping/status requests
- Updated handshake capability reporting to include implemented baseline daemon methods.

### 2026-02-22 — Task #1931

- Added baseline event channel methods `events.subscribe` and `events.unsubscribe` in `packages/daemon/src/rpc.ts`.
- Added per-connection subscription tracking (connection-scoped registries; no shared global subscription state across clients).
- Added unsupported-event reporting via structured `UNSUPPORTED_CAPABILITY` with supported/unsupported event lists.
- Added event dispatch baseline through protocol event frames (`{ event, payload, ts }`) with best-effort delivery.
- Wired runtime emitters for baseline events:
  - `data.changed` via `todu.onChange(...)`
  - `sync.statusChanged` via `todu.sync.onStatusChange(...)`
- Best-effort semantics documented/implemented for baseline:
  - no durable replay buffer in this phase
  - disconnected clients may miss events
  - reconnecting clients are expected to re-subscribe and refresh current state
- Expanded tests:
  - router coverage for subscribe/unsubscribe validation and unsupported events
  - dispatch integration coverage for connection-scoped subscription delivery
  - runtime routing coverage for subscribe/unsubscribe methods over UDS
- Updated `daemon.hello` capability reporting to include event channel methods/events.
