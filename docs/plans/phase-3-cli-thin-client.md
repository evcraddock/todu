# Phase 3: CLI Thin-Client Migration

> Move CLI to daemon-only operation and remove mixed ownership paths.

## Overview

Migrate CLI from direct engine/storage ownership to a pure daemon client model over UDS. This phase enforces fail-fast behavior when daemon is unavailable and removes local mode probing/fallback logic.

## Goals

- Make CLI a strict thin client of local daemon
- Remove direct persistent storage ownership from CLI runtime
- Preserve command behavior while switching transport path
- Provide clear fail-fast UX when daemon is unavailable

## Scope

### Deliverables

1. **CLI daemon transport client**
   - UDS connection handling
   - request/response handling via protocol envelope
   - command-level timeout handling

2. **Command routing migration**
   - CLI command handlers call daemon methods
   - no direct `createTodu()` runtime path for normal command execution

3. **Fail-fast availability behavior**
   - clear daemon-unavailable messaging
   - nonzero exit code mapping
   - no fallback ownership mode

4. **Legacy path removal**
   - remove local sync probe/fallback ownership logic from CLI path

5. **Error/exit mapping**
   - map protocol error codes to user-facing CLI errors and exit codes

6. **Daemon-mode CLI tests**
   - integration tests exercising commands against daemon harness

## Requirements

### Behavioral Constraints

- CLI must not open persistent Automerge storage directly in normal operation
- CLI must target one local daemon per invocation
- CLI must fail fast if daemon is unavailable

### UX Constraints

- Error output should clearly state daemon requirement and remediation path
- Timeout and protocol errors should be distinguishable in output

## Acceptance Criteria

- [ ] Core CLI commands execute via daemon method calls
- [ ] Daemon unavailable returns clear fail-fast message and nonzero exit
- [ ] No residual direct-storage ownership path remains in CLI runtime
- [ ] Legacy probe/fallback ownership logic is removed from CLI path
- [ ] CLI daemon-mode integration tests pass in CI

## Non-Goals

- Electron migration to daemon thin-client mode
- Join safety refactor
- Worker/plugin lifecycle implementation

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

1. CLI is operationally simple and deterministic (one daemon target per invocation)
2. Mixed ownership ambiguity is eliminated from CLI behavior
3. CLI remains feature-equivalent while using daemon transport

## Progress Notes

### 2026-02-23 — Task #1938

- Added reusable CLI daemon transport utility in `packages/cli/src/daemon-transport.ts`.
- Added `createDaemonTransportClient()` + `invokeDaemonMethod()` request lifecycle wrappers for command-module migration work.
- Implemented deterministic fail-fast behavior aligned with architecture policy:
  - connect timeout default: `1000ms`
  - request timeout default: `10000ms`
  - unavailable daemon maps to `DAEMON_UNAVAILABLE`
  - request timeout maps to `TIMEOUT`
- Added focused transport unit coverage in `packages/cli/src/daemon-transport.test.ts`:
  - handshake + request success path
  - unavailable daemon (`ENOENT`) path
  - request timeout path
  - connect timeout path

### 2026-02-23 — Task #1939

- Migrated `project`, `task`, `label`, and `note` command groups to daemon RPC routing.
  - Added CLI daemon command invoker utility in `packages/cli/src/daemon-command-client.ts`.
  - Routed command handlers to core RPC methods (`project.*`, `task.*`, `label.*`, `note.*`) instead of direct `createTodu()` ownership paths.
- Preserved command UX and output semantics while switching transport path.
  - Existing table/JSON output formats remain unchanged for migrated command groups.
  - Existing name/ID resolution behavior for project/label references remains unchanged.
- Added explicit fail-fast UX for daemon-unavailable conditions in migrated command groups.
  - User-facing error now states daemon requirement and remediation: start local daemon and retry.
- Added daemon-mode CLI integration coverage for migrated command groups by updating integration tests to run commands against a real daemon process.
  - Updated `project.test.ts`, `task.test.ts`, `label-note.test.ts`, and `config.test.ts`.
  - Added daemon-unavailable regression assertion in `project.test.ts`.
- Kept non-migrated command tests stable.
  - Updated recurring test setup/assertion paths to avoid cross-mode coupling until recurring/task migration task is complete.

### 2026-02-23 — Task #1940

- Migrated remaining CLI command groups to daemon RPC routing:
  - `recurring` (`packages/cli/src/commands/recurring.ts`)
  - `habit` (`packages/cli/src/commands/habit.ts`)
  - `sync` (`packages/cli/src/commands/sync.ts`)
- Removed mixed ownership fallback initialization path from CLI entrypoint:
  - removed `isSyncServerAvailable` probing and `createTodu()` ownership fallback wiring from `packages/cli/src/index.ts`
  - CLI command execution now routes through daemon invoker for all user command groups
- Preserved command output semantics while switching to daemon transport.
  - Existing text/JSON output shapes for recurring/habit/sync command flows remain functionally equivalent.
- Expanded daemon-mode integration coverage for migrated groups:
  - updated `recurring.test.ts`, `habit.test.ts`, and `sync.test.ts` to run against a real daemon process
  - added daemon-unavailable fail-fast assertion in `sync.test.ts`
- Confirmed full CLI command suite passes in daemon mode and phase checks remain green (`make pre-pr`).
