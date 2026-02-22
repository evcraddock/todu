# Phase 8: Operational Controls + Assignment UX/Runbooks

> Provide practical operator tooling for static assignment and manual failover.

## Overview

Implement the operational layer around worker assignment so daemon-based deployment is manageable in real usage. Keep model intentionally simple: static assignment, per-host operations, explicit manual failover.

## Goals

- Make worker assignment configurable and inspectable
- Provide CLI-based operational controls per daemon context
- Document repeatable runbooks for reassignment and migration
- Improve diagnosability of common operational failures

## Scope

### Deliverables

1. **Assignment configuration surfaces**
   - Local config file support
   - Environment variable overrides

2. **CLI operational controls (single daemon target)**
   - View worker assignment and status
   - Enable/disable/reassign worker types in local context
   - Show blocked/error reasons for workers

3. **Operational status visibility**
   - Worker runtime state (`running`, `blocked`, `error`, etc.)
   - Assignment/dependency issues surfaced clearly

4. **Runbook documentation**
   - Manual reassignment across hosts/contexts
   - Authority migration examples (e.g., Mac mini ↔ k3s)
   - Troubleshooting guide for common failures

## Requirements

### Operational Model

- CLI targets one local daemon per invocation
- No cross-daemon fanout in single command
- Multi-host operations are explicit per host/context

### Documentation Requirements

- Clearly state no lease/election guarantees in initial model
- Clearly describe rollback/safety expectations for join and reassignment

## Acceptance Criteria

- [ ] Assignment config works through file/env as defined
- [ ] CLI can inspect local assignment + worker state
- [ ] CLI can perform local assignment changes as intended
- [ ] Runbooks document multi-host failover steps clearly
- [ ] Troubleshooting docs cover daemon-unavailable, blocked-worker, and assignment ambiguity cases

## Non-Goals

- Automatic failover/election
- Lease-based coordination
- Plugin-specific business logic implementation

## Dependencies

- Phase 6 worker foundation
- Phase 7 recurring worker migration
- Existing daemon/client protocol surface for status/control

## Task Decomposition and Documentation Requirements

All tasks derived from this phase must follow:

- `docs/plans/TASK_EXECUTION_STANDARD.md`

Minimum task context must include:
- `docs/ARCHITECTURE.md`
- `docs/plans/1923-automerge-sync-refactor-research.md`
- This phase doc

Every task must include a documentation step in the same PR (or explicitly justify why no doc update is needed).

## Success Criteria

1. Operators can run and maintain multi-daemon deployments without hidden behavior
2. Manual failover is explicit, documented, and repeatable
3. Operational complexity remains controlled in no-lease initial model