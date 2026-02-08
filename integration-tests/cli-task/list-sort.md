# Test: List Tasks with Sorting

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
toduai project create --name "App"

toduai task create --title "Charlie" --project "App" --priority low --due "2026-06-01"
toduai task create --title "Alpha" --project "App" --priority high --due "2026-01-01"
toduai task create --title "Bravo" --project "App" --priority medium
```

## Default Sort (Priority Desc)

```bash
toduai task list --no-color
```

**Expected:** Alpha (high), Bravo (medium), Charlie (low).

## Sort by Title Ascending

```bash
toduai task list --sort title --asc --no-color
```

**Expected:** Alpha, Bravo, Charlie.

## Sort by Title Descending

```bash
toduai task list --sort title --no-color
```

**Expected:** Charlie, Bravo, Alpha.

## Sort by Due Date Ascending

```bash
toduai task list --sort dueDate --asc --no-color
```

**Expected:** Alpha (2026-01-01), Charlie (2026-06-01), Bravo (no due — last).

## Sort by Due Date Descending

```bash
toduai task list --sort dueDate --no-color
```

**Expected:** Charlie (2026-06-01), Alpha (2026-01-01), Bravo (no due — last).

Tasks without a due date always sort last regardless of direction.

## Sort by Priority Ascending

```bash
toduai task list --sort priority --asc --no-color
```

**Expected:** Charlie (low), Bravo (medium), Alpha (high).

## Cleanup

```bash
rm -rf "$TODU_DATA_DIR"
```
