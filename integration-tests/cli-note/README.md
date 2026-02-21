# CLI Note Integration Tests

Tests for `toduai note` commands with Electron sync verification. Notes can be standalone (journal entries) or attached to entities (tasks, projects).

## Setup

```bash
export TODUAI_DATA_DIR=$(mktemp -d)
export NODE_PATH=$(find ~/.npm/_npx -path "*/node_modules/playwright" -type d 2>/dev/null | head -1 | xargs dirname)
export INTERACT=~/.pi/agent/skills/electron-testing/scripts/interact.js

# Launch Electron with shared data dir
~/.pi/agent/skills/electron-testing/scripts/launch.sh \
  --app-path ./packages/electron/dist/main/index.js \
  --env "TODUAI_DATA_DIR=$TODUAI_DATA_DIR"
```

## Tests

- [add-journal.md](add-journal.md) — Standalone journal entries, verify in Electron
- [add-attached.md](add-attached.md) — Notes attached to tasks and projects
- [list-filters.md](list-filters.md) — Filter by type, tag; verify Electron filters
- [delete.md](delete.md) — Delete notes, verify removal in Electron
- [errors.md](errors.md) — Missing entities, invalid inputs, Electron validation

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODUAI_DATA_DIR"
```
