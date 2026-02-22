# Phase 9: Pi Extension (Daemon Thin Client)

> Deferred phase: implement pi integration as another daemon client.

## Status

Deferred for later design/implementation.

This phase is intentionally high-level. Detailed protocol/tooling decisions will be made after daemon/client architecture phases stabilize.

## Overview

Create/refresh the pi extension so it behaves as a thin client to local daemon, aligned with CLI/Electron architecture.

## Direction (Locked)

- Pi extension should follow daemon-first model
- Pi extension should not directly own persistent storage
- Pi extension should use daemon capabilities/contracts similarly to other clients

## Current Intent

- Replace shell-driven/legacy skill behavior with protocol-native daemon calls where appropriate
- Reuse capability gating semantics (disabled domains/workers reflected to extension behavior)
- Keep extension behavior consistent with daemon-assigned worker model

## Candidate Scope (TBD)

1. Core task/project operations via daemon protocol
2. Capability-aware tool exposure (only advertise enabled domains/capabilities)
3. Join/status visibility where useful for operator workflows
4. Error mapping and user feedback aligned with protocol error taxonomy

## Open Design Questions (Deferred)

1. Exact tool surface exposed in pi extension
2. Session/persistence strategy in extension runtime
3. How extension handles daemon-unavailable fail-fast UX
4. Packaging/distribution/versioning strategy for extension lifecycle
5. Whether extension adds any client-side convenience abstractions beyond direct daemon method mapping

## Dependencies

- Phases 1-4 (daemon + protocol + thin-client migrations)
- Phase 6 capability gating model
- Stable daemon method/capability contract

## Task Decomposition and Documentation Requirements

All tasks derived from this phase must follow:

- `docs/plans/TASK_EXECUTION_STANDARD.md`

Minimum task context must include:
- `docs/ARCHITECTURE.md`
- `docs/plans/1923-automerge-sync-refactor-research.md`
- This phase doc

Every task must include a documentation step in the same PR (or explicitly justify why no doc update is needed).

## Success Criteria (for future implementation)

1. Pi extension behaves as architecture-consistent daemon client
2. Extension honors capability/domain gating semantics
3. Operational behavior matches fail-fast and single-daemon targeting model