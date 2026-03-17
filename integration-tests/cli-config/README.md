# CLI Config Integration Tests

Tests for `todu config` commands with Electron app verification.

## Setup

```bash
export NODE_PATH=$(find ~/.npm/_npx -path "*/node_modules/playwright" -type d 2>/dev/null | head -1 | xargs dirname)
export INTERACT=~/.pi/agent/skills/electron-testing/scripts/interact.js
```

## Tests

- [init.md](init.md) — Initialize a dev config
- [show.md](show.md) — Display resolved configuration
- [dev-workflow.md](dev-workflow.md) — Full dev config workflow with Electron verification

## Notes

There is no config UI in the Electron app. Config tests verify that:
1. CLI config commands work correctly
2. The Electron app starts and loads data when pointed at the same data dir
3. Data created via CLI with a specific config is visible in Electron
