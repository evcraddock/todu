# @todu/engine

## 0.23.7

### Patch Changes

- a1b9435: Pin the stable Automerge core runtime to 3.5.0 and raise the engine's WebSocket dependency floor to 8.22.0 to include security fixes. Retain stable Repo 2.5.6 and its existing installation patches. Clamp overdue Repo storage throttle delays to zero through the engine installation hook, avoiding negative-delay timer warnings while preserving write ordering, positive delays, results, and failure propagation. Repo's UUID 9.0.1 remains under the maintainer-approved exception for GHSA-w5hq-g745-h8pq; this release does not eliminate that advisory.
- ad05646: Add sync-provider API v4 with opaque pull checkpoints acknowledged only after successful local application and storage flush. Keep API v3 providers supported, fail closed on application errors, repair partially persisted task details on equal-timestamp replay, and recover replayed imported comments without duplicates when provenance persistence fails. Drain tracked local filesystem writes on shutdown and show interactive activity dots during daemon stop/restart without changing JSON output.
- Updated dependencies [ad05646]
  - @todu/core@0.24.0

## 0.23.6

### Patch Changes

- c64c3e1: Prevent identical imported task updates from growing Automerge history, safely skip remote sync sends while a WebSocket is closing, and provide a guarded task-list compaction utility for repairing existing histories.

## 0.23.5

### Patch Changes

- adab40b: Fully dispose stale remote sync adapters before watchdog reconnection to prevent outdated-document errors and resource growth.

## 0.23.4

### Patch Changes

- 5c54998: Upgrade Automerge to 3.3.2 so the engine and Automerge Repo use one compatible runtime instance.

## 0.23.3

### Patch Changes

- Keep daemon startup actor repair bounded.
