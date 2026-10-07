---
"@todu/core": minor
"@todu/engine": minor
"@todu/daemon": minor
"@todu/cli": minor
---

Use the shared dataset roster for native peer connections when the daemon's dataset becomes active or `todu sync peers reload` explicitly refreshes targets. Reuse existing identity-checked transport, retry/disposal handling, and matching source/server links without a background roster watcher or new replication/retry layer.

Enrollment reuses the published endpoint or concrete local listener configuration, with an optional `--advertise` override. New requests include an advertised endpoint while historical journals remain readable; listener enablement and binding stay explicit. Preserve local data, configured servers, provider state, and worker assignments. Reload reports target reconciliation, not successful synchronization. Real-device synchronization and recovery require manual production verification beyond local wiring tests.
