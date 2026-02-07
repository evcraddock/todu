# Test: List Tasks with Filters

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
todu-new project create --name "App"
todu-new project create --name "Infra"
todu-new label create --name bug --color "#ff0000"
todu-new label create --name feature --color "#00ff00"

# Create varied tasks
todu-new --format json task create --title "Fix crash" --project "App" --priority high --label bug --due "2020-01-01"
todu-new --format json task create --title "Add search" --project "App" --priority medium --label feature --due "$(date +%Y-%m-%d)"
TASK3=$(todu-new --format json task create --title "Setup CI" --project "Infra" --priority low)
TASK3_ID=$(echo "$TASK3" | jq -r .id)
todu-new task start "$TASK3_ID"
todu-new --format json task create --title "Write docs" --project "App" --priority low --scheduled "$(date +%Y-%m-%d)"
TASK5=$(todu-new --format json task create --title "Old task" --project "App" --priority medium)
TASK5_ID=$(echo "$TASK5" | jq -r .id)
todu-new task done "$TASK5_ID"
```

## List All (No Filter)

```bash
todu-new task list --no-color
```

**Expected:** All 5 tasks shown, sorted by priority desc then createdAt desc.

## Filter by Status

```bash
todu-new task list --status active --no-color
```

**Expected:** Only tasks with status=active (Fix crash, Add search, Write docs).

## Filter by Multiple Statuses

```bash
todu-new task list --status active,inprogress --no-color
```

**Expected:** Tasks that are active or inprogress (Fix crash, Add search, Setup CI, Write docs).

## Filter by Priority

```bash
todu-new task list --priority high --no-color
```

**Expected:** Only "Fix crash".

## Filter by Project

```bash
todu-new task list --project "Infra" --no-color
```

**Expected:** Only "Setup CI".

## Filter by Label

```bash
todu-new task list --label bug --no-color
```

**Expected:** Only "Fix crash".

## Filter Overdue

```bash
todu-new task list --overdue --no-color
```

**Expected:** Only "Fix crash" (due 2020-01-01, still active).

## Filter Today

```bash
todu-new task list --today --no-color
```

**Expected:** "Add search" (due today) and "Write docs" (scheduled today).

## Combined Filters

```bash
todu-new task list --status active --priority medium --no-color
```

**Expected:** Only "Add search" (active + medium priority). "Old task" is medium but done.

## List as JSON

```bash
todu-new --format json task list --status active
```

**Expected:** JSON array of task objects with status=active.

## Cleanup

```bash
rm -rf "$TODU_DATA_DIR"
```
