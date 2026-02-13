# Integration Tests

Prompt-based integration test scripts for the todu CLI and Electron app. Designed for LLM agents to execute step-by-step, verifying both CLI behavior and CLI↔Electron sync.

## Prerequisites

1. Build and link the CLI:
   ```bash
   make build
   npm link --workspace=packages/cli
   ```

2. Build the Electron app:
   ```bash
   npm run --workspace=packages/electron build
   ```

3. Verify CLI works:
   ```bash
   toduai --version
   ```

4. Ensure the `electron-testing` skill is available (scripts in `~/.pi/agent/skills/electron-testing/`).

## Running Tests

Each test uses a temporary data directory shared between CLI and Electron. The standard setup block in each test handles this.

### Standard Setup (CLI + Electron)

```bash
export TODU_DATA_DIR=$(mktemp -d)

# Launch Electron against the same data dir
~/.pi/agent/skills/electron-testing/scripts/launch.sh \
  --app-path ./packages/electron/dist/main/index.js \
  --env "TODU_DATA_DIR=$TODU_DATA_DIR"
```

### Standard Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODU_DATA_DIR"
```

### Electron Interaction

Use the interact.js script to verify Electron state:

```bash
export NODE_PATH=$(find ~/.npm/_npx -path "*/node_modules/playwright" -type d 2>/dev/null | head -1 | xargs dirname)
INTERACT=~/.pi/agent/skills/electron-testing/scripts/interact.js

# Navigate to a view
NODE_PATH=$NODE_PATH node $INTERACT click "text=Projects"

# Take a screenshot
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test.png

# Read visible text
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".content-area"

# Discover interactive elements
NODE_PATH=$NODE_PATH node $INTERACT discover
```

### CLI-Only Tests

If you only need to test CLI behavior (no Electron), use the simpler setup:

```bash
export TODU_DATA_DIR=$(mktemp -d)
# ... run CLI commands ...
rm -rf "$TODU_DATA_DIR"
```

## Test Index

### [cli-project/](cli-project/)
- [create.md](cli-project/create.md) — Create projects (CLI + Electron sync)
- [list.md](cli-project/list.md) — List projects with filters
- [show.md](cli-project/show.md) — Show project details
- [update.md](cli-project/update.md) — Update project fields
- [delete.md](cli-project/delete.md) — Delete projects
- [errors.md](cli-project/errors.md) — Error cases

### [cli-task/](cli-task/)
- [create.md](cli-task/create.md) — Create tasks
- [list-filters.md](cli-task/list-filters.md) — Filter by status, priority, label, overdue, today
- [list-sort.md](cli-task/list-sort.md) — Sort by various fields
- [show.md](cli-task/show.md) — Show task details
- [update.md](cli-task/update.md) — Update task fields
- [status-shortcuts.md](cli-task/status-shortcuts.md) — start, done, cancel
- [move.md](cli-task/move.md) — Move tasks between projects
- [search.md](cli-task/search.md) — Search tasks by title
- [delete.md](cli-task/delete.md) — Delete tasks
- [errors.md](cli-task/errors.md) — Error cases

### [cli-label/](cli-label/)
- [create.md](cli-label/create.md) — Create labels
- [list.md](cli-label/list.md) — List labels
- [update.md](cli-label/update.md) — Update labels
- [delete.md](cli-label/delete.md) — Delete labels
- [errors.md](cli-label/errors.md) — Error cases

### [cli-note/](cli-note/)
- [add-journal.md](cli-note/add-journal.md) — Standalone journal entries
- [add-attached.md](cli-note/add-attached.md) — Notes attached to tasks/projects
- [list-filters.md](cli-note/list-filters.md) — Filter by task, project, tag, author
- [delete.md](cli-note/delete.md) — Delete notes
- [errors.md](cli-note/errors.md) — Error cases

### [cli-habit/](cli-habit/)
- [create.md](cli-habit/create.md) — Create habits with various schedules
- [list.md](cli-habit/list.md) — List habits, filter active/paused
- [show.md](cli-habit/show.md) — Show habit detail with streak stats
- [update.md](cli-habit/update.md) — Update title, schedule, description
- [check.md](cli-habit/check.md) — Check-in/uncheck, verify streaks
- [pause-resume.md](cli-habit/pause-resume.md) — Pause and resume habits
- [delete.md](cli-habit/delete.md) — Delete habits
- [errors.md](cli-habit/errors.md) — Error cases

### [cli-recurring/](cli-recurring/)
- [create.md](cli-recurring/create.md) — Create recurring templates
- [list.md](cli-recurring/list.md) — List/filter templates by status and project
- [show.md](cli-recurring/show.md) — Show template detail with upcoming occurrences
- [update.md](cli-recurring/update.md) — Update title, schedule, priority, project
- [pause-resume.md](cli-recurring/pause-resume.md) — Pause and resume templates
- [generate.md](cli-recurring/generate.md) — Generate tasks from occurrences
- [delete.md](cli-recurring/delete.md) — Delete templates
- [errors.md](cli-recurring/errors.md) — Error cases

### [cli-config/](cli-config/)
- [init.md](cli-config/init.md) — Initialize a dev config
- [show.md](cli-config/show.md) — Display resolved configuration
- [dev-workflow.md](cli-config/dev-workflow.md) — Full dev config workflow

### [lifecycle/](lifecycle/)
- [startup.md](lifecycle/startup.md) — Clean launch, console errors, initial state
- [navigation.md](lifecycle/navigation.md) — Sidebar nav, view switching, back buttons
- [empty-states.md](lifecycle/empty-states.md) — All views with no data
- [keyboard-shortcuts.md](lifecycle/keyboard-shortcuts.md) — Ctrl+N, Ctrl+K, Escape
- [dialogs.md](lifecycle/dialogs.md) — Dialog open/close behavior across all views
- [sync.md](lifecycle/sync.md) — CLI↔Electron sync for all entity types
