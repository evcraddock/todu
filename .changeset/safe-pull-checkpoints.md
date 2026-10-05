---
"@todu/core": minor
"@todu/daemon": minor
"@todu/engine": patch
"@todu/cli": patch
---

Add sync-provider API v4 with opaque pull checkpoints acknowledged only after successful local application and storage flush. Keep API v3 providers supported, fail closed on application errors, repair partially persisted task details on equal-timestamp replay, and recover replayed imported comments without duplicates when provenance persistence fails. Drain tracked local filesystem writes on shutdown and show interactive activity dots during daemon stop/restart without changing JSON output.
