---
"@todu/core": minor
"@todu/engine": minor
"@todu/daemon": minor
"@todu/cli": minor
---

Add a disabled-by-default LAN sync listener using the existing native Automerge Repo and WebSocket adapter. Require an explicit bind address, accept only the current catalog's sync route, keep administration private, and leave local daemon operations available after binding errors. Add local CLI configuration and listener status without changing server settings or worker assignments. Enrollment and automatic roster-derived connections remain follow-up work.
