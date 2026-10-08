# Optional Sync Server Controls

- Task: `task-e0d9e744` — Manage optional sync servers alongside LAN peers.
- Status: Erik approved implementation; local implementation/checks in progress. CI, independent review, merge, and closure retain separate gates.
- Preflight: READY. The task is active, requirements are defined, and `task-b8e0cfb5` is done.

## Objective

Manage the daemon's optional configured server independently of its native direct-peer and listener paths, without changing the existing dataset or introducing another replication system.

## Existing Patterns and Gaps

- `packages/core/src/config.ts` already supports `sync.remote.server`, `sync.remote.enabled`, and environment precedence. A configured URL defaults to enabled for legacy compatibility; disabled resolution currently discards the destination from the effective runtime configuration.
- `packages/engine/src/index.ts` already owns server start/stop, watchdog/disposal handling, and roster/enrollment reuse. Existing `sync start|stop|restart` controls are runtime-only.
- `packages/cli/src/config.ts` patches listener YAML while retaining comments and unrelated settings. Reuse that approach for local server settings rather than rewriting the whole file.
- Roster targets may borrow a configured-server transport. Server stop/replacement must not strand that active peer/source role or require an unrelated roster reload to recover it. Address the lifecycle boundary using the already-selected snapshot, not a new roster watcher or fresh target reconciliation.

## In Scope

- Explicit private local RPC/CLI server settings and lifecycle controls.
- Persisted server enablement and retained destination while disabled, including enablement after disabled startup.
- Preserve environment override precedence, legacy URL-only enablement, and runtime-only legacy controls. Conflicting overrides need actionable guidance rather than false success.
- Independent healthy peers, approved-source links, listener, and local operations across server changes/failures.
- Preserve catalog/replica identity, data, settings, provider-local state, and worker assignments; never inherit source server settings during enrollment.
- Practical local tests and existing integration fixtures; honest separation from manual production evidence.

## Out of Scope

- Electron Settings UI, named accounts, global pause/resume, synchronization-completeness status, automatic discovery or server retirement.
- Document filtering/allowlists, registry authorization, complete offline replicas, new relay/election/retry mechanisms, or native protocol changes.
- Fleet harnesses, expanded CI matrices, publishing/deployment, live configuration/data changes, or agent-run real-device experiments.
- The existing uncommitted `.dev/config.yaml` loopback listener setting: preserve it unchanged and exclude it from task commits. Do not restart or reconfigure the running dev environment as part of automated verification.

## Acceptance Criteria

- [ ] Existing server-only deployments continue working with unchanged data identity, server settings, and worker/provider state.
- [ ] Direct peer and server paths coexist for the current dataset using existing native transport/sharing behavior, without introducing document filtering or claiming catalog/roster authorization.
- [ ] Disabling or losing the server does not interrupt healthy direct links or local operations.
- [ ] Re-enabling a configured server works without data/configuration deletion; enrollment and upgrade do not silently inherit or retire server configuration.

## Stage 1 — Local Settings and Compatibility

**Status:** implemented; focused local checks pass.

- Extend shared server-setting resolution/validation and daemon startup loading in `packages/core/src/config.ts`, `packages/daemon/src/config.ts`, and `packages/daemon/src/run-daemon.ts`.
- Retain disabled server destinations without automatically connecting; keep the existing active-only resolver/API behavior compatible.
- Carry the daemon's actual configuration context to the local settings writer. Patch only server fields, preserving YAML comments, relative paths, listener configuration, provider settings, worker assignments, and unknown fields.
- Validate new WebSocket settings before mutation. Preserve existing URL/protocol/path handling and environment precedence; report conflicting overrides or malformed/unwritable configuration clearly.

**Success criteria:** legacy URL-only configs still enable normally; disabled startup retains its URL without attaching a server adapter; configuration tests show unrelated fields and identifiers are unchanged.

## Stage 2 — Independent Engine Lifecycle and Private RPC

**Status:** implemented; engine, private-RPC, and mock-transport ownership checks pass.

- Extend the existing engine server controls in `packages/engine/src/index.ts` and `packages/engine/src/todu.ts` with a small settings/status interface using `Result` for expected errors. Reuse current native adapter and watchdog/disposal handling.
- Apply server settings to the active engine without restarting the daemon or replacing its Repo. Keep updated local settings for later startup/attachment/switch paths in the daemon.
- Handle the configured-server/roster/enrollment reuse boundary narrowly in `packages/engine/src/peer-connections.ts` and existing source attachment code: disabling/replacing a server must preserve independently active peer/source roles, including a shared endpoint. Do not automatically reread roster edits.
- Wire private `sync.serverStatus` and `sync.serverConfigure` methods through daemon runtime/RPC adapters. Persist only explicitly requested local settings, with actionable save/apply failures rather than silent success. Do not silently bootstrap pending enrollment storage.

**Success criteria:** stop/disable/repoint affects only the server role; healthy unrelated peer adapters and listeners remain intact; reused peer/source roles are not stranded; repeated operations and shutdown do not leak resources; re-enable works after disabled startup. Existing runtime-only `sync start|stop|restart` behavior remains compatible.

## Stage 3 — CLI and Practical Regression Coverage

**Status:** implemented; focused checks, 1,248 unit tests, and repeated built full suites pass.

Add a thin `packages/cli/src/commands/sync-server.ts` registered from `sync.ts`:

```bash
todu sync server status
todu sync server set --url ws://host:3030
todu sync server disable
todu sync server enable
```

- `set` updates the destination while retaining the existing enablement policy; a previously unconfigured URL follows the legacy enabled-by-default policy. `enable`/`disable` explicitly persist the server flag and apply it live. Disabling retains the destination for re-enablement.
- Status distinguishes configured/enabled intent from actual connection state without claiming convergence or remote durability. Support text/JSON and contextual errors.
- Add test-first coverage for config preservation/overrides/invalid inputs, disabled-startup re-enable, idempotent lifecycle/disposal, unavailable server/local usability, distinct and reused peer/source roles, private RPC/CLI, and enrollment settings isolation.
- Reuse the existing real-server and enrollment suites. Add only practical one-engine/one-daemon adapter-boundary tests where useful, not an elaborate simulated fleet. Use temporary settings/storage and isolated HOME/XDG directories; never contact live integrations or use the running dev daemon.

**Success criteria:** each task criterion has focused evidence; legacy tests remain meaningful and passing; mocks are explicitly described as local wiring evidence only.

## Stage 4 — Documentation, Checks, and Delivery Gates

**Status:** first-head CI passed, but independent review requested changes for native shared-channel handoff and pending activation races. Both fixes and focused regressions are implemented; final checks, updated exact-head CI/re-review, merge approval, and closure gates pending.

- Update `docs/architecture/device-sync.md`, `docs/cli-daemon-usage.md`, `docs/daemon-service-operations.md`, and relevant architecture wording; add package Changesets without applying versions or publishing.
- Explain runtime-only versus persisted server controls, environment overrides, peer/listener independence, native sharing/trust limitations, and fallback re-enablement. Include a short manual checklist that prevents a dedicated server from masking direct-peer failures. Retiring a real server remains separately approved.
- Run focused checks, formatting/lint/typecheck, `make pre-pr`, then built isolated `make test-all`, keeping existing supported-platform CI and all meaningful coverage.
- Commit on a task branch, open PR, wait for CI, run independent visible review, and request explicit merge approval. Verify exact-commit post-merge CI. Request separate approval for the detached close gate.

**Success criteria:** local checks/CI pass without weakened assertions, hidden unhandled errors, or retries; review artifacts and approval gates are recorded; actual production peer/server behavior remains unverified until separately authorized manual observations.

## Local Verification Evidence

- `make check` and isolated `make pre-pr` pass; 1,248 unit tests/107 files.
- First-head built isolated `make test-all` runs passed 1,896 tests/162 files, but review proved mocks missed a native routing failure and pending activation race. Two final fixed built isolated suites pass 1,904 tests/163 files each, zero skips, without unhandled-error/storage-race signatures; updated `make check` and `make pre-pr` also pass. Evidence is retained in `/tmp/todu-e0d9e744-logs/`; updated exact-head CI/re-review remain required.
- First-head config/CLI and handoff mocks had red/green evidence, but they did not establish native routing. R1 now retains the original native adapter in place with independently released role lifetimes; re-enable shares it instead of opening a competing socket. Three actual two-Repo/loopback-listener regressions assert exchange after stop/disable/repoint, re-enable, and peer removal. Deliberately opening an overlapping replacement socket instead of adopting the old one makes actual post-stop exchange time out; restoring adoption passes. This is local native evidence, not production convergence proof.
- R2 serializes latest-settings reconciliation and engine publication against configuration operations. Five barrier-controlled cases through existing real enrollment fixtures cover disable/enable/repoint, apply failure, and shutdown. Suppressing both fixes makes seven selected cases fail (one passes for safe shutdown; other tests are filtered out), and restoring them passes.
- One actual local daemon/private-RPC fixture covers offline-server controls without dropping independent peers; built managed CLI startup, disabled restart, and re-enable retain legacy file policy and catalog identity. YAML preservation, environment mismatch, symlinks/permissions, save failure, and runtime-only intent restoration are covered locally.
- Managed startup no longer promotes file server settings into artificial environment overrides; genuine inherited overrides retain precedence. Explicit peer reload also clears removed/retargeted cached source roles so future server operations do not resurrect them.
- `.dev/config.yaml` remains the pre-existing loopback-only change, excluded from the task. The running dev environment, live integrations, production settings/data, release versions, and deployments remain untouched. Actual device exchange/recovery and real-server retirement remain separately authorized manual work.

## Approval Boundary

Erik approved this plan. Implementation is on `feat/task-e0d9e744-optional-sync-server-controls`, based on updated main, and the task is `inprogress`. Preserve the dev configuration change outside task commits; no running-dev or production changes, deployment, or publication are authorized. Stop after three failed attempts at the same issue and ask for guidance instead of layering workarounds.
