# CLI Habit Integration Tests

Tests for `toduai habit` commands with Electron sync verification.

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

- [create.md](create.md) — Create habits via CLI and Electron, verify sync
- [list.md](list.md) — List habits, filter active/paused, verify Electron table
- [show.md](show.md) — Show habit detail with streak stats
- [update.md](update.md) — Update title, schedule, description
- [check.md](check.md) — Check-in/uncheck, verify streak updates
- [pause-resume.md](pause-resume.md) — Pause and resume habits
- [delete.md](delete.md) — Delete habits, verify removal in Electron
- [errors.md](errors.md) — Error cases

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODUAI_DATA_DIR"
```
