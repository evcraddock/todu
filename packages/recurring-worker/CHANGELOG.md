# @todu/recurring-worker

## 0.2.0

### Minor Changes

- Restore normal Changesets publication with accurate manifest version reporting. Require negotiated awaitable-stop host support before activation; cancel future intervals and drain admitted startup/interval work before stop completes. Older hosts refuse activation safely; install with the compatible daemon/core/engine release.

### Patch Changes

- Updated dependencies
  - @todu/core@0.27.0
  - @todu/engine@0.24.3
