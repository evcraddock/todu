# @todu/engine

## 0.24.0

### Minor Changes

- 6d1dee3: Enable sync-provider API v5 task field-group reconciliation with independent winners, remote-wins equal/missing-clock conflicts, structured diagnostics, and winning-value acknowledgment after local persistence. Preserve v3/v4 behavior and defer incomplete assignment mappings.

  Guard v5 task mutations against intervening local edits at the engine boundary, including same-millisecond value changes; preserve the checked clock and retry stale reconciliation rather than restoring an older timestamp. Bootstrap detail repairs and task links use the same guarded path.

  Retain host-local interrupted content application records across failed saves and restart, because title metadata and body details persist separately. Recheck fresh values before acknowledgment, preserve newer edits, and fail ambiguous partial recovery closed. Providers continue to own mirrored snapshots and pending remote writes; no Forgejo-specific mappings, distributed locks, or live configuration changes are included.
- 2dfa2f1: Add trusted-LAN device enrollment through one known peer and explicit local approval. Pristine pending startup avoids default catalog creation and automation; same-dataset replicas retain their identities, data, server configuration, provider state, and worker execution. Bound metadata requests and durable approval receipts support expiry, denial, retries, restart, and abandonment without automatic membership/data cleanup.

  Attach native Automerge replication only after managed approval and eligibility validation, retaining the explicit approved-source link without editing configured-server settings. Serialize native first-use replica identity initialization so persisted, roster, and announced storage IDs agree. This is not authentication, a registry authorization layer, or a guarantee of complete offline replication.
- 6bdb4ab: Expose reliable note `updatedAt` timestamps for content and authorship edits, with validated imported clocks and stable creation-time fallback for legacy notes. Preserve edit clocks through persistence and migrations without scanning note buckets at startup.

  Export actual note edit timestamps to sync providers and preserve newer external comment clocks on import. Compare incoming edits against local edit time so repeated or older deliveries do not overwrite newer local edits; tag, approval, and provenance bookkeeping do not manufacture content edits.
- a0008a4: Add a disabled-by-default LAN sync listener using the existing native Automerge Repo and WebSocket adapter. Require an explicit bind address, accept only the current catalog's sync route, keep administration private, and leave local daemon operations available after binding errors. Add local CLI configuration and listener status without changing server settings or worker assignments. Enrollment and automatic roster-derived connections remain follow-up work.
- 7411098: Add private `todu sync server status|set|enable|disable` controls for machine-local optional server settings. Retain disabled destinations for re-enablement and apply explicit changes without replacing the Repo or restarting the daemon. Preserve legacy URL-default enablement, genuine environment precedence, YAML comments/unrelated settings, identities/data, listener configuration, and provider/worker state. Keep `sync start|stop|restart` runtime-only.

  Preserve independent direct peers and approved sources across server disable, repointing, or connection loss, including cached roles borrowing the configured-server transport. Retain a shared native adapter in place with independent role lifetimes, sharing it again on re-enable rather than opening competing sockets. Reconcile and publish pending enrollment engines atomically against local settings updates. Use existing native identity/retry/disposal handling without a new roster watcher, replication protocol, or sharing/authorization filter. Observe retained native channel replacement/recovery and reconcile disconnected or missing adapters so repeated loss does not leave stale connected state. Status reports intent/connection state, not convergence or durability. Real-device exchange and failure recovery still require separately authorized manual verification.
- fc80b1f: Use the shared dataset roster for native peer connections when the daemon's dataset becomes active or `todu sync peers reload` explicitly refreshes targets. Reuse existing identity-checked transport, retry/disposal handling, and matching source/server links without a background roster watcher or new replication/retry layer.

  Enrollment reuses the published endpoint or concrete local listener configuration, with an optional `--advertise` override. New requests include an advertised endpoint while historical journals remain readable; listener enablement and binding stay explicit. Preserve local data, configured servers, provider state, and worker assignments. Reload reports target reconciliation, not successful synchronization. Real-device synchronization and recovery require manual production verification beyond local wiring tests.

### Patch Changes

- Updated dependencies [6d1dee3]
- Updated dependencies [2d3c8f1]
- Updated dependencies [2dfa2f1]
- Updated dependencies [6bdb4ab]
- Updated dependencies [a0008a4]
- Updated dependencies [7411098]
- Updated dependencies [fc80b1f]
  - @todu/core@0.25.0

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
