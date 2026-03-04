# Phase 7: Recurring as Worker Capability + Manual Fallback

> Move recurring automation into worker runtime while preserving manual control paths.

## Overview

Migrate recurring automation from implicit client startup behavior to explicit worker/plugin execution. Keep manual recurring generation available so recurring remains useful without active automation.

## Goals

- Remove recurring auto-processing from general client startup
- Run recurring automation through worker framework
- Preserve manual recurring generation/backfill workflows
- Maintain deterministic and idempotent task generation behavior

## Scope

### Deliverables

1. **Client startup behavior change**
   - Remove implicit recurring processing from CLI/Electron startup paths

2. **Recurring worker implementation**
   - Implement recurring automation as worker/plugin capability
   - Integrate with assignment and dependency gating model

3. **Manual fallback support**
   - Keep manual recurring generation commands available
   - Preserve explicit backfill/manual-run workflows

4. **Operational status signaling**
   - Clearly indicate when recurring automation is inactive
   - Recurring templates remain usable as core data model regardless of worker presence

5. **Test coverage**
   - Worker-driven recurring generation flows
   - No client-side auto-run regression tests
   - Manual generation idempotency/deterministic-ID tests

## Requirements

### Behavior

- Recurring automation execution source is worker runtime only
- Core recurring template CRUD/list/upcoming behavior remains available without worker
- Manual generation must remain safe to run repeatedly

### Safety

- Deterministic recurring task IDs must be preserved
- Duplicate generation should remain idempotent under normal retry/re-run scenarios

## Acceptance Criteria

- [x] Recurring is no longer auto-processed during normal client startup
- [ ] Assigned recurring worker generates due occurrences correctly
- [ ] Manual recurring generation works when no recurring worker is active
- [ ] Deterministic ID behavior remains intact and tested
- [ ] Clear status messaging exists for recurring automation active/inactive state

## Implementation Notes

- Client startup auto-processing for recurring was removed in task #1954.
- Recurring materialization remains available through explicit/manual paths while worker-based automation is implemented in later task(s).

## Non-Goals

- External integration workers (GitHub/Forgejo)
- Lease-based worker coordination
- Advanced recurring scheduling policy redesign

## Dependencies

- Phase 6 worker/plugin foundation + capability gating
- Existing recurring domain model and deterministic ID behavior

## Task Decomposition and Documentation Requirements

All tasks derived from this phase must follow:

- `docs/plans/TASK_EXECUTION_STANDARD.md`

Minimum task context must include:
- `docs/ARCHITECTURE.md`
- `docs/plans/1923-automerge-sync-refactor-research.md`
- This phase doc

Every task must include a documentation step in the same PR (or explicitly justify why no doc update is needed).

## Success Criteria

1. Recurring automation is architecture-consistent with plugin/worker model
2. Recurring remains usable in both automated and manual-only deployments
3. Client behavior becomes predictable (no hidden startup automation side effects)