# @todu/cli

## 0.24.2

### Patch Changes

- ad05646: Add sync-provider API v4 with opaque pull checkpoints acknowledged only after successful local application and storage flush. Keep API v3 providers supported, fail closed on application errors, repair partially persisted task details on equal-timestamp replay, and recover replayed imported comments without duplicates when provenance persistence fails. Drain tracked local filesystem writes on shutdown and show interactive activity dots during daemon stop/restart without changing JSON output.
- Updated dependencies [ad05646]
  - @todu/daemon@0.24.0
  - @todu/engine@0.23.7

## 0.24.1

### Patch Changes

- ca373f1: Support npm package specifiers in daemon plugin configuration and keep fresh daemon installations on the engine-compatible Automerge runtime.
- Updated dependencies [ca373f1]
  - @todu/daemon@0.23.3

## 0.24.0

### Minor Changes

- 6031ce3: Launch the terminal UI when `todu` runs without arguments.

## 0.23.3

### Patch Changes

- 7dced5e: Add `todu tui` as a convenience wrapper for launching the standalone Todu TUI from installed packages or a source checkout.
