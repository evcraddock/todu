---
"@todu/core": minor
"@todu/daemon": minor
"@todu/engine": patch
---

Add sync-provider API v4 with opaque pull checkpoints acknowledged only after successful local application and storage flush. Keep API v3 providers supported, fail closed on application errors, and recover replayed imported comments without duplicates when provenance persistence fails.
