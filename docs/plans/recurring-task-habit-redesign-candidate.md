# Recurring Task / Habit Redesign Candidate

> Updated direction: permanent, minimal, task-first design.

## Purpose

Define a long-term direction for recurring work that keeps the core product minimal for task-focused users, while allowing niche extensions through plugins.

## Long-Term Product Stance (Decision)

1. **Core product is task-first.**
   - Users who only care about tasks/projects should get a complete experience without plugins.
2. **Plugins are permanent extension points for niche needs.**
   - Plugins are not a staging area for future core features.
3. **Core should stay minimal and explicit.**
   - Avoid adding broad schema/features that primarily serve plugin-specific behavior.

## Current State (Relevant)

- Recurring templates exist in core and include project association.
- Recurring processing currently performs catch-up generation (stacking behavior).
- Habit exists as a separate core domain today.
- Recurring automation runs via worker plugin execution.

## Core Direction to Pursue

## 1) Add minimal recurring miss policy in core

Add one core behavior field to recurring templates:

```ts
type MissPolicy = "accumulate" | "rollForward";
```

Recommended template shape change:

```ts
interface RecurringTemplate {
  // existing fields...
  missPolicy?: MissPolicy; // default: "accumulate"
}
```

Why this belongs in core:
- It is mainstream recurring-task behavior, not niche.
- It removes ambiguity for users and clients.
- It keeps behavior explicit and testable.

## 2) Keep default behavior unchanged for existing users

- Default should remain `accumulate` to preserve current expectations.
- `rollForward` is opt-in per template.

## 3) Roll-forward semantics (core)

For `missPolicy=rollForward`:

1. Determine the latest scheduled occurrence due as of "today" (template timezone).
2. Ensure only one current actionable occurrence is represented.
3. Missed prior dates do not create debt/backlog tasks.
4. Completion marks the current occurrence only.

This supports workflows like "process finances daily" where users should not do multiple missed runs tomorrow.

## 4) Maintain deterministic and safe multi-device behavior

- Preserve deterministic generation expectations and idempotency guarantees.
- Ensure processing remains safe when run from a designated authority daemon.

## Core Scope to Avoid (for this redesign)

Do **not** expand core with these right now:

- recurring `uiMode` fields for habit presentation
- recurring streak subsystem as a first-class core feature
- recurring metrics schema in core
- broad plugin metadata blobs in primary core entities

Rationale: these add model/UI surface area beyond the minimal task-first objective.

## Habit Strategy Under Task-First Direction

- Do not expand Habit as a major core investment in this redesign.
- Keep current habit functionality stable for compatibility.
- Treat richer habit-style workflows (streak-heavy, metric-heavy, custom UX) as plugin territory unless they become clearly mainstream task requirements.

## Plugin Policy (Permanent Extension Model)

Plugins remain the home for niche extensions, but the durable plugin policy now
lives in:

- `docs/adr/0001-plugin-boundaries-and-data-ownership.md`
- `docs/architecture/plugins.md`

Summary of the current direction:

- plugin features must remain optional for baseline task workflows
- plugin internals must not live in Automerge core entities
- plugin-owned internal state should live in local plugin-managed storage
- plugin outputs may be promoted into normal core entities when user-visible
- plugin contracts must be explicit, versioned, and fail closed when incompatible
- plugin failures must not break baseline task workflows
- plugins should not force generic metadata bags or hidden semantic changes into core

## Explicit Pursue / Do Not Pursue

## Pursue

- Minimal core recurring policy: `missPolicy` (`accumulate`/`rollForward`)
- Backward-compatible defaults (`accumulate`)
- Clear processing semantics and tests for both policies
- Keep worker/plugin automation model for operational flexibility

## Do Not Pursue (now)

- Plugin-first-as-experiment strategy for core product decisions
- Core recurring UI/habit presentation mode fields
- Core recurring streak/metrics feature expansion
- Broad UI plugin platform work as part of this redesign
- Plugin data bags on core entities as default architecture

## Migration Notes (High-Level)

1. Add `missPolicy` to recurring templates with default `accumulate`.
2. Keep existing templates behavior unchanged unless explicitly updated.
3. Add CLI/Electron controls for selecting `rollForward` on recurring templates.
4. Add focused tests for:
   - accumulate catch-up behavior
   - roll-forward no-backlog behavior
   - cross-device/idempotent processing expectations

## Open Implementation Questions

1. Exact roll-forward representation strategy (update existing open occurrence vs rematerialize latest safely).
2. Interaction with manual generation commands under roll-forward.
3. Deletion/skip semantics under roll-forward (how user intent is preserved).
4. Boundary between core recurring behavior and plugin-owned niche behavior in docs/help text.

## Success Criteria

- Task-only users can model common recurring work with no plugin dependency.
- `rollForward` solves non-stacking recurring workflows cleanly.
- Core remains minimal and understandable.
- Plugins remain clearly optional extensions, not a shadow core.

## Decision Status

- **Status:** Candidate direction updated for task-first minimalism
- **Decision:** Pending final approval
- **Next step:** create implementation plan focused only on core `missPolicy` + processing semantics
