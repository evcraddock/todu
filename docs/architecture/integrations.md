# Generic External Integration Architecture

## Status

Proposed architecture direction from task #2186.

This document defines the intended generic model for external sync providers such as GitHub and Forgejo. It is a design target for the project architecture and should not be read as a claim that the full surface is already implemented.

## Purpose

External integrations need a shared desired-state model that can be created and managed from any machine, while execution remains local to whichever daemon is assigned authority for that provider.

Projects do not require an external integration. A project without an integration binding is a normal todu-native project managed entirely within todu.

This solves the main mismatch in a plugin-local integration binding design:

- users work from many machines
- provider plugins may run only on one authority daemon host
- integration bindings still need to be visible and editable everywhere

## Design Goals

- Keep integration binding management in core synced state so any machine can create or edit bindings.
- Keep execution local to provider plugins running on assigned authority daemon hosts.
- Preserve clean plugin boundaries by keeping provider runtime internals out of synced core entities.
- Support multiple providers through one generic product surface.
- Keep the initial core model small, typed, and understandable.

## Decision Summary

- A project may have zero or one integration binding in v1.
- Projects without an integration binding remain fully managed within todu.
- External sync strategy lives on the integration binding, not on the project.
- An active integration binding always covers both issues/tasks and comments.
- Credentials remain local to the authority daemon and are not stored or referenced in synced core state.
- Integration bindings live in one shared integration registry document.
- Integration binding status lives in one separate per-integration-binding status document.
- Integration bindings are the canonical model immediately; no legacy compatibility layer is required.

## Non-Goals

- Defining provider-specific credential flows in this document.
- Defining a general-purpose plugin metadata bag in core entities.
- Implementing the GitHub or Forgejo providers here.
- Designing lease-based authority coordination.

## Core Desired-State Model

Core should own a small synced integration binding model.

Each integration binding represents the user's intended relationship between one todu project and one external target for one provider.

### Integration binding fields

| Field | Type | Purpose | Notes |
| --- | --- | --- | --- |
| `id` | integration binding ID | Stable identifier for the integration binding | Used by plugin-local runtime state as a foreign key |
| `provider` | string | Provider identity such as `github` or `forgejo` | Generic field owned by core |
| `projectId` | project ID | Linked todu project | Core entity relationship |
| `targetKind` | string | Kind of external target such as `repository` | Keeps the core model structured without provider blobs |
| `targetRef` | string | Normalized external target identity such as `owner/repo` | Provider interprets the value according to `provider` + `targetKind` |
| `strategy` | enum | Desired sync behavior for this binding | Initial values: `bidirectional`, `pull`, `push`, `none` |
| `enabled` | boolean | Desired execution state | `false` keeps binding visible but inactive |
| `createdAt` | timestamp | Audit field | Core-owned |
| `updatedAt` | timestamp | Audit field | Core-owned |

This initial shape is intentionally small. It captures user intent without storing provider runtime internals in core.

### Initial v1 constraints

To keep the first version simple and avoid overlapping control planes:

- a project may have zero or one integration binding
- projects without an integration binding remain fully managed within todu
- external sync strategy lives on the integration binding, not on the project
- project-level external sync settings should not remain as a second control plane

### What stays out of the core integration binding

Do not add provider-specific blobs or generic key/value bags for plugin internals.

The following remain outside synced core entities:

- credentials and tokens
- credential references
- cursors and checkpoints
- retry and backoff state
- linkage tables between local and external comments/items
- loop-prevention bookkeeping
- provider diagnostics and caches

## Credential provisioning in v1

Credential provisioning is local to the authority daemon and remains outside synced core state.

In v1:

- integration bindings do not contain credentials
- integration bindings do not contain credential references
- the authority daemon must be configured locally with provider credentials
- the initial provisioning mechanism should be provider-specific environment variables or equivalent local daemon configuration

This keeps secrets fully local while leaving room for future secret backends such as keychains, local secret files, or service-manager secret injection.

## Storage Placement

Integration bindings should live in the normal synced catalog document graph as lightweight shared metadata.

The important architecture rule is ownership, not a specific low-level document shape:

- integration bindings are core synced data
- integration bindings are visible on every machine in the dataset
- provider runtime state remains local to the daemon host running the provider plugin

Initial storage shape should be:

- one shared integration registry document referenced by the catalog for integration bindings
- one separate integration binding status document per integration binding for synced operational status

This keeps shared desired state simple while isolating higher-churn status updates per integration binding.

## Ownership Boundary

| Category | Owned by | Why |
| --- | --- | --- |
| Integration binding identity, linked project, target reference, strategy, enabled state | Core synced model | Users must be able to view and manage these from any machine |
| Credentials, tokens, API secrets | Provider-local runtime storage | Secrets should not sync through Automerge core state |
| Cursors, checkpoints, retry state | Provider-local runtime storage | Operational internals belong to the executing daemon |
| Item and comment linkage tables | Provider-local runtime storage | They are provider bookkeeping, not baseline user data |
| Tasks and notes created as sync results | Core entities | They are user-visible product outputs |
| Plugin logs and diagnostics | Local daemon/plugin runtime | Operational data should remain local and observable |

## Execution Model

The generic execution flow should be:

1. A user creates or updates an integration binding from any machine.
2. The integration binding syncs through Automerge like other core data.
3. An authority daemon host with the relevant provider plugin sees the integration binding.
4. The daemon host filters integration bindings by provider type and `enabled` state.
5. The host starts or updates provider-local runtime for each applicable integration binding.
6. The provider performs bootstrap and steady-state pull/push work for that integration binding.
7. User-visible outputs are written back to normal core entities such as tasks and notes.
8. Those outputs sync back to all machines through the normal replication path.

Machines without the provider plugin still show the shared desired state. They do not need provider-specific local runtime in order to display or edit integration bindings.

## Integration binding status

Integration binding desired state and execution status are separate concerns.

- the integration binding is the synced desired-state record
- integration binding status is a separate synced operational record
- the authority daemon writes status for the integration bindings it executes
- non-authority machines read that status through the normal synced dataset

This separation keeps configuration intent distinct from runtime health and activity.

### Initial v1 status fields

| Field | Type | Purpose |
| --- | --- | --- |
| `bindingId` | integration binding ID | Identifies which integration binding this status describes |
| `state` | enum | Current execution state: `running`, `idle`, `blocked`, or `error` |
| `authorityId` | string | Stable identifier or label for the authority daemon host |
| `lastSuccessfulSyncAt` | timestamp or null | Most recent successful sync completion |
| `lastAttemptedSyncAt` | timestamp or null | Most recent sync attempt |
| `lastErrorSummary` | string or null | Short actionable error summary when state is `error` or `blocked` |
| `updatedAt` | timestamp | Last status update time |

The status record is a shared observability surface, not plugin-local runtime state. It exists so users on non-authority machines can understand whether an integration binding has been picked up and whether it is healthy.

Each integration binding gets its own status document so frequent sync activity does not create unnecessary churn or contention across unrelated integrations.

## Provider Consumption Model

Sync provider plugins should consume integration bindings rather than defining the binding registry themselves.

### Host responsibilities

The daemon/plugin host should:

- load provider plugins from local module paths
- enumerate shared integration bindings from core state
- select integration bindings matching the provider type
- apply assignment and local authority policy
- pass integration binding context plus local provider settings into the runtime layer
- surface local execution status, blocked state, and runtime failures

### Provider responsibilities

The provider plugin should:

- interpret `targetKind` and `targetRef` for its provider
- initialize local runtime state keyed by `catalogId` + `bindingId`
- perform external API bootstrap, pull, push, and comment sync work
- map external records into normal core tasks and notes
- keep internal bookkeeping local to the authority daemon host

### Runtime identity

Provider-local runtime state should key off the integration binding identity, not just the project identity.

That allows:

- multiple integration bindings for the same provider over time
- possible future support for multiple integration bindings touching one project when explicitly allowed
- clean local cleanup when an integration binding is removed or disabled

## CLI and App Management Flows

The user-facing management surface should be generic and speak in terms of integrations while operating on concrete integration bindings.

Preferred CLI direction:

```text
todu integration list
todu integration add --provider github --project <project> --target-kind repository --target <owner/repo> --strategy bidirectional
todu integration update <binding-id> --target <owner/repo>
todu integration set-strategy <binding-id> --strategy <bidirectional|pull|push|none>
todu integration enable <binding-id>
todu integration disable <binding-id>
todu integration remove <binding-id>
todu integration status [<binding-id>]
```

Equivalent Electron UI should present the same concepts:

- list existing integration bindings
- create an integration binding
- edit integration binding target or linked project
- enable or disable an integration binding
- remove an integration binding
- show local execution status when available

Provider-specific credential setup should remain separate from integration binding lifecycle because secrets are local runtime concerns, not shared desired state.

## Relationship to the SyncProvider Runtime Contract

The current `SyncProvider` runtime contract is still useful, but it should be understood as an execution contract rather than a binding-management contract.

Architecturally, the host should own integration binding orchestration and provider plugins should execute against bindings supplied by the host.

This means the long-term direction is:

- shared integration binding desired state lives in core
- host orchestration translates integration bindings into provider runtime work
- provider-local config is for local settings and secrets
- provider runtime internals stay local

## Impact on GitHub and Forgejo Provider Design

### GitHub provider impact

The GitHub provider should no longer own the canonical repo-to-project integration binding registry in plugin-local storage.

Instead it should:

- consume shared core integration bindings where `provider = github`
- treat each integration binding as one unit of sync authority and local runtime state
- keep credentials, cursors, linkage tables, and loop-prevention state local
- write synced outputs back to normal tasks and notes
- rely on the generic integration management surface for create/update/remove flows

### Forgejo provider impact

Forgejo should follow the same architecture, differing only in provider-specific target interpretation, auth, and API behavior.

That keeps the product surface generic while allowing providers to vary internally.

## Sync scope in v1

In the initial integration model, an active integration binding always covers both issues/tasks and comments.

Comments are treated as a vital part of the task record, not as an optional extra capability.

As a result:

- issue/task sync is always included
- comment sync is always included
- there is no separate comment-sync capability flag in v1

## Adoption and cutover

No legacy data migration is required for this architecture.

Current external-sync-shaped data should be treated as disposable sample or test data rather than as a compatibility constraint.

As a result:

- integration bindings are the canonical model immediately
- no compatibility layer is required for legacy project/system external sync assumptions
- implementation may discard existing sample data if needed
- implementation may introduce a new root catalog/document layout if that is the simplest path to the new model

New external sync work should be designed only against the integration binding model and related per-integration-binding status documents.

## Phased Follow-Up Work

### Phase 1: Core integration domain design

- Add the integration binding schema to core architecture/docs and eventual core types.
- Add one shared integration registry document plus one per-integration-binding status document to the catalog graph design.
- Enforce the initial rule that a project may have at most one integration binding.
- Adopt the new model directly without a legacy compatibility layer.

### Phase 2: Host orchestration and status model

- Add daemon-side orchestration for provider selection by integration binding.
- Expose synced integration binding status separately from integration binding desired state.
- Define local cleanup behavior when integration bindings are disabled or removed.

### Phase 3: Generic management surfaces

- Add CLI integration commands.
- Add Electron integration management UI.
- Keep provider auth/setup separate from generic integration binding CRUD.
- Document provider-specific local credential environment/config requirements for authority daemons.

### Phase 4: Provider redesign

- Redesign GitHub provider against the shared integration binding model.
- Implement Forgejo provider against the same model.
- Add conformance coverage for integration-binding-driven provider execution.

## Related Documents

- `docs/ARCHITECTURE.md`
- `docs/architecture/plugins.md`
- `docs/adr/0001-plugin-boundaries-and-data-ownership.md`
- `docs/plugin-sync-provider-api.md`
- `docs/worker-plugin-api.md`
