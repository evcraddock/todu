# CLI Task Integration Tests

Tests for `toduai task` commands.

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
```

## Tests

- [create.md](create.md) — Create tasks with various options
- [list-filters.md](list-filters.md) — Filter by status, priority, label, overdue, today, multi-status
- [list-sort.md](list-sort.md) — Sort by priority, dueDate, title, createdAt
- [show.md](show.md) — Show task details
- [update.md](update.md) — Update task fields
- [status-shortcuts.md](status-shortcuts.md) — start, done, cancel shortcuts
- [move.md](move.md) — Move tasks between projects
- [search.md](search.md) — Search tasks by title
- [delete.md](delete.md) — Delete tasks
- [errors.md](errors.md) — Error cases
