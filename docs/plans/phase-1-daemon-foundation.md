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