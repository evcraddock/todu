---
"@todu/daemon": patch
---

Fix graceful shutdown hanging on idle or persistent connected clients. Stop RPC admission, drain actual in-flight handlers even after response timeout or client disconnect, clean up connections and subscriptions, and close the final engine after any admitted catalog join. Keep Node alive until shutdown actually settles, including disconnected handlers with only unreferenced timers. Propagate shutdown failures instead of reporting successful process shutdown or reusing an unsafe runtime instance.
