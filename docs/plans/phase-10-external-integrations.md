# Phase 10: External Integrations Core Architecture

> Implement the core integration binding architecture for external sync providers.

## Status

Planned.

This phase turns the architecture from `docs/architecture/integrations.md` into core data model, daemon surface, and generic management workflows.

## Overview

External integrations should be managed through a shared core integration binding model that can be created and edited from any machine, while execution remains local to authority daemons running provider plugins.

This phase establishes that control plane in core todu before provider-specific implementation work proceeds.

## Direction (Locked)

- A project may have zero or one integration binding in v1.
- Projects without an integration binding remain fully managed within todu.
- External sync strategy lives on the integration binding, not on the project.
- An active integration binding always covers both issues/tasks and comments.
- Credentials remain local to the authority daemon and are never stored in synced core state.
- Integration bindings live in one shared integration registry document.
- Integration binding status lives in one separate per-integration-binding status document.
- Integration bindings are the canonical model immediately; no legacy compatibility layer is required.

See also:

- `docs/architecture/integrations.md`
- `docs/ARCHITECTURE.md`
- `docs/architecture/plugins.md`
- `docs/plugin-sync-provider-api.md`

## Deliverables

1. Core integration binding data model and catalog graph design
2. Engine CRUD/query APIs for integration bindings and status
3. Daemon RPC surface for integration binding management and status
4. Generic CLI integration management commands
5. Host/runtime orchestration that executes sync providers from integration bindings
6. Contract and conformance updates for binding-driven provider execution
7. Removal of conflicting project-level external sync control-plane behavior

## Scope

### In scope

- Integration binding schema and validation
- Integration registry/status document ownership model
- Integration binding CRUD/query APIs
- Integration binding status read/write model
- Daemon RPC methods for integration management
- Generic CLI management flows under `todu integration ...`
- Host/provider execution flow driven by integration bindings
- Removal of conflicting legacy assumptions in core implementation

### Out of scope

- Full provider-specific GitHub implementation details in this repo task phase
- Rich credential backends beyond env/local config
- Lease-based multi-daemon authority coordination
- Multi-binding-per-project support

## Proposed Task Decomposition

1. **Core: define integration binding schema and catalog graph support**
   - Add integration binding types/schema and validation.
   - Add integration registry document plus per-integration-binding status document references in catalog design.
   - Enforce zero-or-one integration binding per project.

2. **Engine: integration binding CRUD and status APIs**
   - Add create/list/get/update/delete integration binding operations.
   - Add read/write support for integration binding status.
   - Add tests for lifecycle and constraint enforcement.

3. **Daemon: integration RPC surface**
   - Expose integration CRUD/query/status methods over daemon protocol.
   - Align errors and validation behavior with existing protocol patterns.

4. **CLI: generic integration management commands**
   - Add `todu integration list|add|update|set-strategy|enable|disable|remove|status`.
   - Keep terminology aligned with integration binding architecture.

5. **Daemon host: provider execution driven by integration bindings**
   - Enumerate integration bindings from core state.
   - Select provider execution by binding/provider type.
   - Update per-integration-binding status documents from authority daemon execution.

6. **Contracts/tests: binding-driven provider model**
   - Align sync provider host/runtime contract with integration-binding-driven execution.
   - Extend conformance coverage for binding-driven orchestration.

7. **Core cleanup: remove conflicting external sync control paths**
   - Remove or neutralize project-level external sync behavior that conflicts with integration bindings.
   - Ensure integration binding becomes the single external sync control plane.

## Dependencies

- `docs/architecture/integrations.md`
- `docs/ARCHITECTURE.md`
- `docs/architecture/plugins.md`
- `docs/plugin-sync-provider-api.md`
- Phase 6 worker/plugin foundation
- Current daemon thin-client architecture phases

## Task Decomposition and Documentation Requirements

All tasks derived from this phase must follow:

- `docs/plans/TASK_EXECUTION_STANDARD.md`

Minimum task context must include:

- `docs/architecture/integrations.md`
- `docs/ARCHITECTURE.md`
- `docs/architecture/plugins.md`
- `docs/plugin-sync-provider-api.md`
- This phase doc

Every task must include a documentation step in the same PR, or explicitly justify why no doc update is needed.

## Success Criteria

1. Integration bindings are the only core control plane for external sync.
2. Projects without integrations remain unchanged and fully usable.
3. Non-authority machines can view synced integration binding status.
4. Sync providers execute from integration bindings rather than plugin-local binding registries.
5. Follow-up provider work can target a stable binding-driven architecture.

## Follow-Up Outside This Repo

- `todu-github-plugin` architecture/implementation work should consume this phase output.
- Existing waiting design task `#2178` is the likely follow-up for the GitHub plugin side and may need minor updates to match final core terminology.
