---
"@todu/core": minor
"@todu/engine": minor
"@todu/daemon": patch
---

Expose reliable note `updatedAt` timestamps for content and authorship edits, with validated imported clocks and stable creation-time fallback for legacy notes. Preserve edit clocks through persistence and migrations without scanning note buckets at startup.

Export actual note edit timestamps to sync providers and preserve newer external comment clocks on import. Compare incoming edits against local edit time so repeated or older deliveries do not overwrite newer local edits; tag, approval, and provenance bookkeeping do not manufacture content edits.
