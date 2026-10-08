---
"@todu/core": patch
"@todu/cli": patch
---

Select and persist a local LAN address during explicit listener enablement when no saved bind or `--bind` override exists. Preserve saved ports and bindings, report selection errors without wildcard fallback, and retain explicit restart-to-apply behavior and trusted-LAN warnings.
