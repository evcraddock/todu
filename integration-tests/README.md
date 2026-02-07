# Integration Tests

Manual integration test scripts for the `todu-new` CLI. Designed for LLM agents to execute step-by-step to verify CLI behavior end-to-end.

## Prerequisites

1. Build and link the CLI:
   ```bash
   make build
   npm link --workspace=packages/cli
   ```

2. Verify it works:
   ```bash
   todu-new --version
   ```

## Running Tests

Each test uses a temporary data directory so it won't affect your real data. Set `TODU_DATA_DIR` before running:

```bash
export TODU_DATA_DIR=$(mktemp -d)
```

Then follow the steps in any test file. Each test is self-contained with setup, commands, expected output, and cleanup.

To reset between tests:
```bash
rm -rf "$TODU_DATA_DIR" && export TODU_DATA_DIR=$(mktemp -d)
```

## Test Index

### [cli-project/](cli-project/)
- [create.md](cli-project/create.md) — Create projects
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
