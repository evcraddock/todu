---
"@todu/core": minor
"@todu/engine": minor
"@todu/daemon": minor
"@todu/cli": minor
---

Add private `todu sync server status|set|enable|disable` controls for machine-local optional server settings. Retain disabled destinations for re-enablement and apply explicit changes without replacing the Repo or restarting the daemon. Preserve legacy URL-default enablement, genuine environment precedence, YAML comments/unrelated settings, identities/data, listener configuration, and provider/worker state. Keep `sync start|stop|restart` runtime-only.

Preserve independent direct peers and approved sources across server disable, repointing, or connection loss, including cached roles borrowing the configured-server transport. Retain a shared native adapter in place with independent role lifetimes, sharing it again on re-enable rather than opening competing sockets. Reconcile and publish pending enrollment engines atomically against local settings updates. Use existing native identity/retry/disposal handling without a new roster watcher, replication protocol, or sharing/authorization filter. Status reports intent/connection state, not convergence or durability. Real-device exchange and failure recovery still require separately authorized manual verification.
