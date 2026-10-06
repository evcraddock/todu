# @todu/daemon

## 0.24.1

### Patch Changes

- bc42cc7: Fix graceful shutdown hanging on idle or persistent connected clients. Stop RPC admission, drain actual in-flight handlers even after response timeout or client disconnect, clean up connections and subscriptions, and close the final engine after any admitted catalog join. Keep Node alive until shutdown actually settles, including disconnected handlers with only unreferenced timers. Propagate shutdown failures instead of reporting successful process shutdown or reusing an unsafe runtime instance.

## 0.24.0

### Minor Changes

- ad05646: Add sync-provider API v4 with opaque pull checkpoints acknowledged only after successful local application and storage flush. Keep API v3 providers supported, fail closed on application errors, repair partially persisted task details on equal-timestamp replay, and recover replayed imported comments without duplicates when provenance persistence fails. Drain tracked local filesystem writes on shutdown and show interactive activity dots during daemon stop/restart without changing JSON output.

### Patch Changes

- a1b9435: Pin the stable Automerge core runtime to 3.5.0 and use the updated engine WebSocket dependency and nonnegative Repo storage throttle delay repair. Retain stable Repo 2.5.6 and its existing installation patches; the maintainer-approved UUID 9.0.1 exception for GHSA-w5hq-g745-h8pq remains.
- Updated dependencies [ad05646, a1b9435]
  - @todu/core@0.24.0
  - @todu/engine@0.23.7

## 0.23.3

### Patch Changes

- ca373f1: Support npm package specifiers in daemon plugin configuration and keep fresh daemon installations on the engine-compatible Automerge runtime.
