# CLI Project Integration Tests

Tests for `todu project` commands with Electron sync verification.

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
export NODE_PATH=$(find ~/.npm/_npx -path "*/node_modules/playwright" -type d 2>/dev/null | head -1 | xargs dirname)
export INTERACT=~/.pi/agent/skills/electron-testing/scripts/interact.js

# Launch Electron with shared data dir
~/.pi/agent/skills/electron-testing/scripts/launch.sh \
  --app-path ./packages/electron/dist/main/index.js \
  --env "TODU_DATA_DIR=$TODU_DATA_DIR"
```

## Tests

- [create.md](create.md) — Create projects via CLI and Electron, verify sync
- [list.md](list.md) — List projects with filters
- [show.md](show.md) — Show project details by name or ID
- [update.md](update.md) — Update project fields, verify in Electron
- [delete.md](delete.md) — Delete projects, verify removal in Electron
- [errors.md](errors.md) — Error cases

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODU_DATA_DIR"
```
