# @todu/cli

## 0.25.0

### Minor Changes

- 2dfa2f1: Add trusted-LAN device enrollment through one known peer and explicit local approval. Pristine pending startup avoids default catalog creation and automation; same-dataset replicas retain their identities, data, server configuration, provider state, and worker execution. Bound metadata requests and durable approval receipts support expiry, denial, retries, restart, and abandonment without automatic membership/data cleanup.

  Attach native Automerge replication only after managed approval and eligibility validation, retaining the explicit approved-source link without editing configured-server settings. Serialize native first-use replica identity initialization so persisted, roster, and announced storage IDs agree. This is not authentication, a registry authorization layer, or a guarantee of complete offline replication.
- a0008a4: Add a disabled-by-default LAN sync listener using the existing native Automerge Repo and WebSocket adapter. Require an explicit bind address, accept only the current catalog's sync route, keep administration private, and leave local daemon operations available after binding errors. Add local CLI configuration and listener status without changing server settings or worker assignments. Enrollment and automatic roster-derived connections remain follow-up work.
- 7411098: Add private `todu sync server status|set|enable|disable` controls for machine-local optional server settings. Retain disabled destinations for re-enablement and apply explicit changes without replacing the Repo or restarting the daemon. Preserve legacy URL-default enablement, genuine environment precedence, YAML comments/unrelated settings, identities/data, listener configuration, and provider/worker state. Keep `sync start|stop|restart` runtime-only.

  Preserve independent direct peers and approved sources across server disable, repointing, or connection loss, including cached roles borrowing the configured-server transport. Retain a shared native adapter in place with independent role lifetimes, sharing it again on re-enable rather than opening competing sockets. Reconcile and publish pending enrollment engines atomically against local settings updates. Use existing native identity/retry/disposal handling without a new roster watcher, replication protocol, or sharing/authorization filter. Observe retained native channel replacement/recovery and reconcile disconnected or missing adapters so repeated loss does not leave stale connected state. Status reports intent/connection state, not convergence or durability. Real-device exchange and failure recovery still require separately authorized manual verification.
- fc80b1f: Use the shared dataset roster for native peer connections when the daemon's dataset becomes active or `todu sync peers reload` explicitly refreshes targets. Reuse existing identity-checked transport, retry/disposal handling, and matching source/server links without a background roster watcher or new replication/retry layer.

  Enrollment reuses the published endpoint or concrete local listener configuration, with an optional `--advertise` override. New requests include an advertised endpoint while historical journals remain readable; listener enablement and binding stay explicit. Preserve local data, configured servers, provider state, and worker assignments. Reload reports target reconciliation, not successful synchronization. Real-device synchronization and recovery require manual production verification beyond local wiring tests.

### Patch Changes

- Updated dependencies [6d1dee3]
- Updated dependencies [2dfa2f1]
- Updated dependencies [6bdb4ab]
- Updated dependencies [a0008a4]
- Updated dependencies [7411098]
- Updated dependencies [fc80b1f]
- Updated dependencies [e3f6b6e]
  - @todu/engine@0.24.0
  - @todu/daemon@0.25.0

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
