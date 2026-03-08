# Plugin Architecture and Boundaries

## Purpose

This document captures the product and architecture rules that plugins must
follow in todu.

It complements:

- `docs/adr/0001-plugin-boundaries-and-data-ownership.md` for the durable
  decision and rationale
- `docs/worker-plugin-api.md` for worker plugin authoring details
- `docs/plugin-sync-provider-api.md` for sync provider plugin authoring details

This document is a reference for how plugins fit into the system. It is not a
proposal for a broad new UI plugin platform.

## Product Role of Plugins

Plugins are optional extensions for niche workflows.

Core product behavior should remain complete for task/project users without any
plugin dependency.

Plugins may provide:

- alternative automation policies beyond core defaults
- niche routine or habit-oriented workflows
- domain-specific enrichment and reporting
- external system integration

Plugins should not redefine baseline task behavior through hidden conventions.

## Current Plugin Host Surfaces

Current implemented plugin host surfaces are daemon-loaded plugins.

### Worker plugins

Worker plugins add automation capabilities while remaining outside the core
baseline domain model.

See `docs/worker-plugin-api.md` for the author-facing contract.

### Sync provider plugins

Sync provider plugins integrate todu with external systems.

See `docs/plugin-sync-provider-api.md` for the author-facing contract.

### Shared desired state for external integrations

When an external integration must be created or managed from any machine, the integration binding desired state belongs in core synced data rather than plugin-local storage.

Sync provider plugins should consume that shared integration binding model and keep runtime internals such as credentials, cursors, linkage tables, and diagnostics in local plugin-managed storage.

See `docs/architecture/integrations.md` for the canonical integration architecture.

### Future plugin surfaces

Additional plugin surfaces may be introduced later, but they require separate
explicit design.

This document does not define a general CLI or Electron UI plugin platform.

## Data Ownership Model

### Core entities own core user data

Core entities should contain the data needed for baseline task/project
workflows.

### Plugin internals stay outside synced core entities

Do not store plugin internal state in Automerge core entities.

Reasons:

- installations without the plugin should not receive plugin-specific internals
- synced core data should remain understandable without plugin-specific
  interpretation
- plugin removal should not leave opaque internal blobs behind in normal core
  models

### Plugin-owned local storage

Plugin internal state should live in plugin-managed local storage.

That storage is the right place for plugin-specific caches, indexes, metrics,
state machines, and other internal bookkeeping.

### Association with core entities

When a plugin needs to relate local plugin state to a core entity, use foreign
keys such as:

- `catalogId`
- `entityType`
- `entityId`

This preserves clean boundaries while still allowing plugins to attach meaning
and behavior to normal core entities.

### Promote outputs, not internals

If a plugin produces user-visible outcomes, write those outcomes to normal core
entities where appropriate.

Examples include:

- tasks created as a visible result of plugin behavior
- notes or records that users should see in baseline product surfaces

Keep plugin-owned internal metadata local.

## Lifecycle Expectations

Plugin lifecycle should be explicit and observable.

Expected operations include:

- install
- enable
- disable
- remove

For automation-oriented plugins:

- worker assignment controls where automation runs
- a single authority machine is a supported operating model
- daemon status/logs should make plugin state visible

Plugin failures should be isolated from baseline task workflows.

## Compatibility and Safety Expectations

Plugin contracts must be:

- explicit
- versioned
- validated at load/install time

Incompatible plugins should fail closed with clear errors.

Plugins should not run in a partially compatible state.

Plugin documentation should clearly describe:

- required domains
- configuration requirements
- operational behavior
- any assumptions about daemon placement or assignment

## Core Boundaries Plugins Must Respect

Plugins must not force the following into core as a default architecture:

- generic key/value expansion on core entities solely for plugin internals
- hidden conventions that redefine baseline recurring semantics
- plugin-only behavior that baseline task users must install to get a complete
  task workflow

For the recurring redesign specifically, this means the current core direction
remains focused on a minimal recurring `missPolicy`, while richer habit-style
presentation and streak/metrics-heavy behavior remain outside current core
scope.

## Operational Notes

Recurring automation already runs through worker/plugin execution in the
current daemon-first architecture.

That means plugin behavior should continue to align with the daemon/worker
operational model documented in `docs/ARCHITECTURE.md`.

## Related Documents

- `docs/adr/0001-plugin-boundaries-and-data-ownership.md`
- `docs/ARCHITECTURE.md`
- `docs/architecture/integrations.md`
- `docs/worker-plugin-api.md`
- `docs/plugin-sync-provider-api.md`
- `docs/plans/recurring-task-habit-redesign-candidate.md`
