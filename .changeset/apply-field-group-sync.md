---
"@todu/core": minor
"@todu/engine": minor
"@todu/daemon": minor
---

Enable sync-provider API v5 task field-group reconciliation with independent winners, remote-wins equal/missing-clock conflicts, structured diagnostics, and winning-value acknowledgment after local persistence. Preserve v3/v4 behavior and defer incomplete assignment mappings.

Guard v5 task mutations against intervening local edits at the engine boundary, including same-millisecond value changes; preserve the checked clock and retry stale reconciliation rather than restoring an older timestamp. Bootstrap detail repairs and task links use the same guarded path.

Retain host-local interrupted content application records across failed saves and restart, because title metadata and body details persist separately. Recheck fresh values before acknowledgment, preserve newer edits, and fail ambiguous partial recovery closed. Providers continue to own mirrored snapshots and pending remote writes; no Forgejo-specific mappings, distributed locks, or live configuration changes are included.
