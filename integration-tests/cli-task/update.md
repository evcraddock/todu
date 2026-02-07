# Test: Update Task

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
todu-new project create --name "My App"
todu-new label create --name bug --color "#ff0000"
TASK=$(todu-new --format json task create --title "Fix bug" --project "My App")
TASK_ID=$(echo "$TASK" | jq -r .id)
```

## Update Title

```bash
todu-new task update "$TASK_ID" --title "Fix critical bug"
```

**Expected:**

```
Task updated:
ID:          task-XXXXXXXX
Title:       Fix critical bug
...
```

## Update Priority

```bash
todu-new task update "$TASK_ID" --priority high
```

**Expected:** Shows priority changed to `high`.

## Update Status

```bash
todu-new task update "$TASK_ID" --status inprogress
```

**Expected:** Shows status changed to `inprogress`.

## Add Label

```bash
todu-new task update "$TASK_ID" --label bug
```

**Expected:** Shows labels include `bug`.

## Add Due Date

```bash
todu-new task update "$TASK_ID" --due "2026-03-15"
```

**Expected:** Shows `Due: 2026-03-15`.

## Update Multiple Fields

```bash
todu-new task update "$TASK_ID" --title "Ship fix" --priority low
```

**Expected:** Both title and priority updated.

## Verify

```bash
todu-new task show "$TASK_ID"
```

**Expected:** Shows all accumulated changes.

## Cleanup

```bash
rm -rf "$TODU_DATA_DIR"
```
