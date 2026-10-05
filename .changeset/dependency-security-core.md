---
"@todu/engine": patch
"@todu/daemon": patch
---

Pin the stable Automerge core runtime to 3.5.0 and raise the engine's WebSocket dependency floor to 8.22.0 to include security fixes. Retain stable Repo 2.5.6 and its existing installation patches. Clamp overdue Repo storage throttle delays to zero through the engine installation hook, avoiding negative-delay timer warnings while preserving write ordering, positive delays, results, and failure propagation.
