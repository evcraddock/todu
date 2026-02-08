# CLI Label Integration Tests

Tests for `toduai label` commands.

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
```

## Tests

- [create.md](create.md) — Create labels with name and color
- [list.md](list.md) — List all labels
- [update.md](update.md) — Update label name and color
- [delete.md](delete.md) — Delete labels
- [errors.md](errors.md) — Duplicate names, invalid colors
