---
"@todu/daemon": patch
---

Preserve another daemon's Unix socket during failed competing startup and shutdown. Serialize socket publication/cleanup, bind privately, and only unlink the public endpoint owned by the current transport.
