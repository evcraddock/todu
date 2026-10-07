---
"@todu/core": minor
"@todu/engine": minor
"@todu/daemon": minor
---

Enable sync-provider API v5 task field-group reconciliation with independent winners, remote-wins equal/missing-clock conflicts, structured diagnostics, and winning-value acknowledgment after local persistence. Preserve v3/v4 behavior and defer incomplete assignment mappings.

Retain host-local interrupted content application records across failed saves and restart, because title metadata and body details persist separately. Recheck fresh values before acknowledgment, preserve newer edits, and fail ambiguous partial recovery closed. Providers continue to own mirrored snapshots and pending remote writes; no Forgejo-specific mappings, distributed locks, or live configuration changes are included.
