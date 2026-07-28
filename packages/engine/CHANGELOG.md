# @todu/engine

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
