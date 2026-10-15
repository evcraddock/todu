# @todu/recurring-worker

## 0.2.1

### Patch Changes

- Release opt-in sync-provider API v7 with scoped canonical observations, explicit unknown-baseline initialization, guarded persisted-value receipts, bounded legacy v4 recovery readiness, consistent guarded push snapshots, and separate local operator workflow intent. Preserve v3–v6 contracts; defer approval-restricted or incompletely mapped values instead of fabricating mirrored history. Align the recurring worker's dependency metadata with the compatible host release without changing worker behavior. This release does not adopt Forgejo, migrate live data, or prove remote durability.
- Updated dependencies
  - @todu/core@0.28.0
  - @todu/engine@0.24.4

## 0.2.0

### Minor Changes

- Restore normal Changesets publication with accurate manifest version reporting. Require negotiated awaitable-stop host support before activation; cancel future intervals and drain admitted startup/interval work before stop completes. Older hosts refuse activation safely; install with the compatible daemon/core/engine release.

### Patch Changes

- Updated dependencies
  - @todu/core@0.27.0
  - @todu/engine@0.24.3
