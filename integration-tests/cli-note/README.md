# CLI Note Integration Tests

Tests for `toduai note` commands. Notes can be standalone (journal entries) or attached to entities (tasks, projects).

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
```

## Tests

- [add-journal.md](add-journal.md) — Standalone journal entries
- [add-attached.md](add-attached.md) — Notes attached to tasks and projects
- [list-filters.md](list-filters.md) — Filter by task, project, tag, author
- [delete.md](delete.md) — Delete notes
- [errors.md](errors.md) — Missing entities, invalid inputs
