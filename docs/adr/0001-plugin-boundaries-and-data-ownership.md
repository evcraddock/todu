# ADR 0001: Plugin Boundaries and Data Ownership

## Status

Proposed

## Date

2026-03-07

## Context

Plugin-related decisions were being captured inside
`docs/plans/recurring-task-habit-redesign-candidate.md`.

Those decisions are broader than the recurring redesign itself. They define
how plugins relate to the core product, what data plugins may own, and what
safety/compatibility guarantees the host should enforce. That policy needs a
more durable home than a candidate redesign document.

Relevant current context:

- Core product direction is task-first.
- Recurring behavior is part of core task workflows.
- Richer niche workflows, including habit-style extensions, are expected to
  live in plugins when they are not mainstream core requirements.
- Existing architecture already uses daemon-loaded worker and sync-provider
  plugins.

## Decision

### 1. Core remains task-first and complete without plugins

Users who only care about tasks and projects should get a complete baseline
experience without installing plugins.

Plugins are optional extensions, not a requirement for baseline task use.

### 2. Plugins are permanent extension points for niche workflows

Plugins are not a staging area for future core features by default.

A plugin may inform a future core decision, but the existence of a plugin does
not imply planned promotion into core.

### 3. Core should not expand primarily to host plugin internals

Do not add broad schema or metadata expansion to core entities solely to make
plugin-specific behavior easier to store.

In particular, plugin internals should not drive generic key/value blobs or
similar default expansion of synced core models.

### 4. Plugin internals must not be stored in Automerge core entities

Plugin-owned internal state must live outside synced core entities.

This prevents plugin-specific internal data from leaking into installs that do
not have the plugin and keeps core data understandable without plugin-specific
knowledge.

### 5. Plugin-owned state should use local plugin-managed storage

Plugin internal state should be stored in plugin-managed local paths.

Plugins may associate their local state with core entities by foreign keys,
using identifiers such as:

- `catalogId`
- `entityType`
- `entityId`

### 6. Promote outputs, not internals

If a plugin produces user-visible outcomes, those outcomes may be written to
normal core entities such as tasks or notes.

Plugin internal metadata should remain plugin-owned and local.

### 7. Plugin contracts must be explicit, versioned, and validated

Plugin host contracts must be versioned and checked at load/install time.

Incompatible plugins should fail closed with clear errors rather than running
in a partially compatible state.

### 8. Plugin failure must not break baseline task workflows

A plugin may fail, be blocked, or be disabled without breaking core task and
project workflows.

Operational status should be visible through normal daemon status/logging.

### 9. Plugin lifecycle must be explicit and observable

Install, enable, disable, and remove operations should be explicit and
observable.

When automation is involved, worker assignment should determine where plugin
behavior runs, including support for a single authority machine.

## Consequences

### Positive

- Core data stays minimal and understandable.
- Plugin behavior remains optional and isolated.
- Multi-install safety is improved because plugin internals do not leak into
  shared synced models.
- Product boundaries are clearer for future work such as habit-oriented
  extensions.

### Trade-offs

- Plugins must manage their own local storage and migration concerns.
- Cross-device plugin experiences may require more explicit operational setup.
- Some richer workflows may feel less integrated than if they were modeled
  directly in core.

### Immediate implications

- Habit-style presentation, streak-heavy behavior, and metrics-heavy workflows
  should be treated as plugin territory unless they become clear mainstream
  task requirements.
- Do not add default `pluginData`-style bags to core entities as the primary
  plugin architecture.
- Core/product docs should distinguish core behavior from plugin behavior.

## Alternatives Considered

### 1. Plugin-first experimentation as the normal path to core

Not chosen.

This weakens the task-first product boundary and encourages plugins to become a
shadow staging area for core features.

### 2. Namespaced plugin data stored directly on core entities

Not chosen as the default architecture.

This would expand synced core models to carry plugin internals and would leak
plugin-specific state into installations that do not use the plugin.

### 3. Expand core to cover richer habit UI, streaks, and metrics now

Not chosen.

That would increase core model and UI surface area beyond the current
minimal-core direction.

## Related Documents

- `docs/plans/recurring-task-habit-redesign-candidate.md`
- `docs/ARCHITECTURE.md`
- `docs/architecture/plugins.md`
- `docs/architecture/integrations.md`
- `docs/worker-plugin-api.md`
- `docs/plugin-sync-provider-api.md`
