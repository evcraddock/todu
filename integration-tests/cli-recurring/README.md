# CLI Recurring Template Integration Tests

Tests for `toduai recurring` commands with Electron sync verification.

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

- [create.md](create.md) — Create templates via CLI and Electron, verify sync
- [list.md](list.md) — List templates, filter by status/project, verify Electron table
- [show.md](show.md) — Show template detail with upcoming occurrences
- [update.md](update.md) — Update title, schedule, priority, project, description
- [pause-resume.md](pause-resume.md) — Pause and resume templates
- [generate.md](generate.md) — Generate tasks from upcoming occurrences
- [delete.md](delete.md) — Delete templates, verify removal in Electron
- [errors.md](errors.md) — Error cases

## Notes

- All `recurring create` commands require `--timezone` and `--start-date`
- Templates require a `--project` (unlike habits)
- Generated tasks get IDs prefixed with `sched-` (not `task-`)

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODUAI_DATA_DIR"
```
