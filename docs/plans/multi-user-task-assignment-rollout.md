# Multi-user Task Assignment Rollout Strategy

## Status

Historical rollout plan for the assignment and actor model defined in `docs/plans/multi-user-task-assignment.md`.

Compatibility-window note:

- Both known sync providers are now on API v3.
- Core host/runtime support for sync-provider API v2 has been removed.
- This document remains as rollout history and sequencing context.

## Purpose

This document describes how to roll out the actor-based assignment model across core todu and the known dependent packages without requiring a flag-day upgrade.

Primary dependent surfaces today:

- core todu repo
- `todu-github-plugin`
- `todu-forgejo-plugin`
- `todu-pi-extensions`

The goal is to minimize user disruption, preserve sync continuity, and allow each downstream package to move at its own pace.

## Rollout goals

The rollout should:

- preserve existing local data through migration
- preserve sync behavior for users who upgrade core before plugins
- avoid a requirement that every plugin and UI package release simultaneously
- keep old provider plugins working for at least one compatibility window
- make failures obvious and recoverable
- allow incremental testing and rollback at each stage

## Rollout non-goals

This rollout does not try to:

- preserve the legacy string-based storage model indefinitely
- guarantee zero implementation work in downstream packages
- introduce permanent dual-write storage
- keep the old sync-provider API forever

## Scope

This rollout covers:

- core schema and migration strategy
- runtime compatibility for sync-provider plugins
- rollout sequencing across plugin and UI packages
- verification strategy
- rollback strategy

This rollout does not fully specify the implementation details of each downstream repository. Those should be tracked as repo-specific tasks derived from this document.

## Baseline assumptions

- core storage will move forward to the actor-based model
- compatibility should be handled at system boundaries, not by preserving two canonical storage models forever
- the sync-provider boundary is the most important compatibility seam
- `todu-pi-extensions` should be allowed to upgrade independently from sync providers
- existing data is safe to migrate using the agreed normalization rules from the design note

## Known impacted systems

## 1. Core todu repo

Impacted areas include:

- core types and schema
- engine task and note persistence
- validation
- migration
- daemon plugin host/runtime
- CLI and Electron baseline flows
- sync-provider API documentation and validation

## 2. `todu-github-plugin`

Impacted areas include:

- provider manifest `apiVersion`
- assignee import/export handling
- comment author import handling
- support for structured external actor refs
- optional trust-aware behavior assumptions

## 3. `todu-forgejo-plugin`

Impacted areas are roughly the same as the GitHub plugin.

## 4. `todu-pi-extensions`

Impacted areas include:

- task display and editing
- note display and editing
- actor management UI/commands
- project authorized assignee management
- binding mapping and trust UI
- approval-needed UI/commands

## Rollout principles

### 1. Migrate storage once

Persisted data should migrate to the actor model once.

Do not maintain two canonical persisted representations such as:

- `Task.assignees: string[]`
- and `Task.assigneeActorIds: ActorId[]`

at the same time as equal sources of truth.

### 2. Keep compatibility at boundaries

Compatibility should live in:

- runtime adapters
- provider host shims
- read-model adapters for old consumers

not in long-lived duplicate storage.

### 3. Additive first, removal later

The first releases should add:

- actor storage
- migration
- compatibility adapters
- new provider contract support

Only later releases should remove old behavior.

### 4. Upgrade consumers independently

Core, plugins, and `todu-pi-extensions` should be able to upgrade on separate schedules during the compatibility window.

### 5. Fail soft when possible

Examples:

- unmapped outbound assignees should warn, not fail sync
- pending imported-content approval should block agent use, not human visibility
- old plugins should continue to sync through compatibility adapters where possible

## Compatibility strategy

## Storage compatibility

### Canonical storage after migration

After migration, the canonical model should be:

- catalog `actors[]`
- catalog `ownerActorId`
- task `assigneeActorIds`
- note `authorActorId`
- project `authorizedAssigneeActorIds`

### Legacy read compatibility

Where older code still expects string values, the system should derive them from actors as needed.

Examples:

- legacy task-assignee string view derived from actor `displayName`
- legacy note-author string view derived from actor `displayName`

This compatibility should be exposed only where needed and should not become a permanent second storage model.

## Sync-provider API compatibility

This is the most important compatibility seam.

### Current state

Current provider API is version `2` and expects:

- string assignees
- string note/comment authors
- direct `mapToTask(...)` and `mapFromTask(...)` methods

### Target state

Target provider API should use:

- structured `ExternalActorRef`
- normalized import payloads
- normalized export payloads
- runtime-owned actor resolution and approval computation

### Rollout requirement

During rollout, the host should support both:

- provider API v2
- provider API v3

That means the host-side compatibility policy should change from:

- exact single-version match only

to something like:

- supported API versions = `{2, 3}` during the transition window

### Host responsibilities during the compatibility window

For **v2 providers**:

- convert pulled string assignees and authors into actors
- create or reuse actor mappings during pull
- derive approval state in runtime
- convert local actor assignment back into string assignees on push
- preserve existing comment push behavior where providers post as the integration account

For **v3 providers**:

- accept normalized import/export payloads directly
- bypass legacy string conversion shims

### Removal policy

Do not remove v2 support until:

- `todu-github-plugin` has shipped on v3
- `todu-forgejo-plugin` has shipped on v3
- compatibility coverage has been validated in end-to-end tests

## UI compatibility

`todu-pi-extensions` should move to the actor model, but it should not block core rollout.

### Core requirement

Core should expose enough compatibility behavior that old UI surfaces do not immediately break after migration.

### Preferred UI rollout

- old UI continues to work against compatibility-backed reads during a short window
- new UI moves to actor concepts as soon as practical
- actor management, mapping, and approval UX ship incrementally rather than as one giant release

## Rollout phases

## Phase 0: preparation and contract design

### Deliverables

- finalize design note
- finalize rollout plan
- define provider API v3 types
- define compatibility policy for supported provider API versions
- identify all core migration entry points and all downstream repos

### Success criteria

- design and rollout docs are approved
- downstream repos have clear upgrade targets
- compatibility window policy is explicit

## Phase 1: core additive groundwork

### Scope

Add core structures without yet removing compatibility paths.

### Core changes

- add actor types
- add catalog actor storage
- add `ownerActorId`
- add project `authorizedAssigneeActorIds`
- add task `assigneeActorIds`
- add note `authorActorId`
- add approval metadata structures
- add binding-scoped actor mapping and trust structures
- add provider API v3 types alongside existing v2 types
- update plugin host validation to support both v2 and v3 during transition

### Important rule

No downstream repo should be required to upgrade at this phase boundary.

### Success criteria

- core compiles with v2 and v3 provider support paths present
- existing tests continue to pass
- new actor-model tests exist for storage and validation behavior

## Phase 2: migration implementation

### Scope

Implement and validate migration from legacy string identities to actors.

### Migration behavior

- create actors from task assignees and note authors using agreed normalization
- map legacy `"user"` and missing note authors to `ownerActorId`
- rewrite tasks and notes to actor ids
- backfill project authorized assignee lists
- make migration idempotent

### Safety requirements

- if migration fails, fail before partial destructive cleanup
- avoid writing partially migrated mixed-state data that cannot be retried safely
- migration should be resumable or repeatable without corruption

### Success criteria

- migrated datasets load cleanly
- legacy datasets upgrade deterministically
- actor ids remain stable across repeated startup attempts after successful migration

## Phase 3: runtime compatibility shims

### Scope

Make old providers and old UI reads continue to work against migrated data.

### Deliverables

- v2 provider pull adapter: strings -> actors
- v2 provider push adapter: actors -> strings
- compatibility read helpers for any old internal consumers that still expect strings
- warnings and diagnostics around unmapped assignees remain operational

### Success criteria

- core with migrated data can still sync through unmodified v2 providers
- old provider behavior remains correct enough for one transition window
- no actor information is silently lost in local storage even when external push degrades gracefully

## Phase 4: `todu-pi-extensions` upgrade

### Scope

Upgrade the UI package to native actor concepts.

### Deliverables

- actor list and actor management flows
- project authorized assignee editor
- task multi-actor assignment UI and commands
- binding mapping and trust management flows
- approval-needed views and approval actions
- stale unauthorized-assignee indicators
- skipped-unmapped-assignee warning display

### Success criteria

- `todu-pi-extensions` works directly with actor-based core data
- no dependency on legacy string-assignee assumptions remains in active UI flows

## Phase 5: `todu-github-plugin` v3 upgrade

### Scope

Ship GitHub on the new provider contract.

### Deliverables

- manifest bump to provider API v3
- `ExternalActorRef` support
- normalized import payload support
- normalized export payload support
- GitHub-specific actor extraction using stable external ids and login data

### Success criteria

- GitHub sync works against core without v2 shims
- pull creates or reuses actors correctly
- push uses mapped actor refs correctly
- approval and trust flows behave as expected for imported GitHub content

## Phase 6: `todu-forgejo-plugin` v3 upgrade

Same goals as GitHub, adapted for Forgejo specifics.

## Phase 7: stabilization window

### Scope

Run with:

- migrated core storage
- updated UI package where available
- both v2 and v3 provider support still enabled

### Purpose

This gives time to:

- find migration bugs
- validate plugin behavior
- validate approval behavior in real usage
- validate trust and mapping UX

### Exit criteria

- both known sync providers ship v3
- no critical migration bugs remain open
- no major compatibility regressions remain unresolved

## Phase 8: legacy removal

### Status

Completed. The compatibility window has ended and core host/runtime support for sync-provider API v2 has been removed.

### Scope

Remove temporary compatibility layers.

### Removals

- provider API v2 support
- legacy string-assignee compatibility helpers no longer needed internally
- obsolete migration-only code after sufficient release distance

### Preconditions

Do not begin this phase until:

- both known provider plugins are on v3
- the compatibility window has elapsed
- migration success has been validated on representative datasets

## Versioning and release strategy

## Core release strategy

Recommended release flow:

### Release A

- additive actor groundwork
- migration
- runtime compatibility shims
- v2 + v3 provider host support

This is the most important release.

### Release B

- `todu-pi-extensions` actor-native UI support
- optional refinement to warnings, approval UX, and actor management

### Release C

- `todu-github-plugin` v3

### Release D

- `todu-forgejo-plugin` v3

### Release E

- removal of v2 provider support

A single package may release multiple times within each broad stage. The important part is the compatibility ordering, not the exact number of version tags.

## Compatibility window

Recommended minimum:

- keep v2 provider support for at least one full core release cycle after both known providers have shipped v3

Conservative option:

- two release cycles if early adopters reveal migration or plugin edge cases

## Downtime minimization strategy

## User-visible downtime

Target: no planned sync downtime required.

### How to achieve that

- core should upgrade first with compatibility shims
- old providers should keep working immediately after core upgrade
- plugin upgrades can happen later without breaking already-upgraded core users

## Local migration downtime

A one-time local startup migration pause is acceptable if:

- it is bounded
- progress/errors are visible
- it either completes fully or fails cleanly

## External sync continuity

Sync should remain operational throughout the transition except where:

- a provider is explicitly broken by a regression
- an unmapped assignee is intentionally omitted with warning
- imported content requires approval before agent use

## Verification strategy

## Core verification

Must include:

- unit tests for actor schema and validation
- migration tests for legacy tasks and notes
- restart tests proving migrated data reloads correctly
- tests for unauthorized stale assignee behavior
- tests for approval-state persistence and reset on content changes
- tests for binding mappings and trust behavior

## Provider compatibility verification

For **v2 compatibility mode**:

- pull string assignees -> actors
- pull string authors -> actors
- push actor assignments -> string assignees
- unmapped actor warnings behave correctly

For **v3 mode**:

- structured actor refs import correctly
- structured actor refs export correctly
- raw provider payloads remain optional and non-canonical

## End-to-end verification matrix

At minimum, verify these combinations:

| Core | GitHub plugin | Forgejo plugin | UI | Expected result |
| --- | --- | --- | --- | --- |
| new | old v2 | old v2 | old | works through compatibility shims |
| new | new v3 | old v2 | old | mixed provider compatibility works |
| new | old v2 | new v3 | new | mixed provider compatibility works |
| new | new v3 | new v3 | new | full target state works |

Also verify:

- migrated dataset with no integrations
- migrated dataset with GitHub only
- migrated dataset with Forgejo only
- migrated dataset with both bindings present

## Operational observability

During rollout, add or preserve diagnostics for:

- migration start, completion, and failure
- number of actors created during migration
- number of mappings auto-created during pull
- skipped unmapped outbound assignees
- pending approval counts for imported content
- provider API version loaded per binding/provider

## Rollback strategy

## Core rollback

Because storage migration moves the canonical schema forward, core rollback must be handled carefully.

### Recommended policy

- before first migrated startup, create a backup or snapshot of local data
- if migration fails before commit, stay on old version or fix migration and retry
- if migration succeeds and writes new schema, rolling back to an older core build may not be supported

This should be documented clearly in release notes.

## Plugin rollback

Plugin rollback should be easy during the compatibility window.

Examples:

- new core + old v2 plugin should still work
- new core + reverted `todu-pi-extensions` should continue to function via compatibility paths where supported

## Rollback of v3 providers

If a v3 provider release regresses:

- revert the plugin to the last known good version
- keep core on compatibility mode supporting both v2 and v3
- do not rush legacy removal until both providers are stable

## Task decomposition recommendation

Recommended implementation task order inside the core repo:

1. add actor types, storage fields, and validation scaffolding
2. implement migration and migration tests
3. implement runtime compatibility shims for provider v2
4. add provider API v3 types and dual-version validation support
5. update internal sync runtime to speak both contracts
6. add approval metadata storage and enforcement plumbing
7. add core CLI/Electron baseline support where applicable
8. document compatibility and release notes

Recommended downstream tasks:

### `todu-pi-extensions`

1. actor-aware task and note display
2. project authorization editor
3. actor management flows
4. binding mapping and trust UI
5. approval-needed views and commands

### `todu-github-plugin`

1. add v3 provider contract support
2. migrate actor extraction and assignee export logic
3. add v3 conformance tests

### `todu-forgejo-plugin`

1. add v3 provider contract support
2. migrate actor extraction and assignee export logic
3. add v3 conformance tests

## Documentation requirements

When implementation begins, update at least:

- `docs/plans/multi-user-task-assignment.md`
- `docs/plugin-sync-provider-api.md`
- `docs/ARCHITECTURE.md` if compatibility or migration behavior becomes canonical architecture
- any plugin author or UI docs impacted by new commands, settings, or trust/approval behavior

## Exit condition

This rollout is complete when:

- actor-based storage is the only canonical storage model
- both known sync providers use provider API v3
- `todu-pi-extensions` is actor-native
- approval metadata and trust behavior are working in practice
- legacy provider v2 compatibility code has been removed
