# CLI Task Integration Tests

Tests for `toduai task` commands with Electron sync verification.

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

- [create.md](create.md) — Create tasks via CLI and Electron, verify sync
- [list-filters.md](list-filters.md) — Filter by status, priority, label, overdue, today
- [list-sort.md](list-sort.md) — Sort by various fields
- [show.md](show.md) — Show task details, verify Electron detail view
- [update.md](update.md) — Update task fields, verify in Electron
- [status-shortcuts.md](status-shortcuts.md) — start, done, cancel, reopen
- [move.md](move.md) — Move tasks between projects
- [search.md](search.md) — Search tasks by title
- [delete.md](delete.md) — Delete tasks, verify removal in Electron
- [errors.md](errors.md) — Error cases

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODUAI_DATA_DIR"
```
