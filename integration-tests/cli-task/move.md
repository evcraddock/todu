# Test: Move Task

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
toduai project create --name "Source"
toduai project create --name "Destination"
TASK=$(toduai --format json task create --title "Movable task" --project "Source")
TASK_ID=$(echo "$TASK" | jq -r .id)
```

## Move to Another Project

```bash
toduai task move "$TASK_ID" "Destination"
```

**Expected:**

```
Moved task to Destination:
ID:          task-XXXXXXXX
Title:       Movable task
Status:      active
Priority:    medium
Project:     Destination
Labels:      (none)
Created:     YYYY-MM-DDTHH:MM:SS.MMMZ
Updated:     YYYY-MM-DDTHH:MM:SS.MMMZ
```

## Verify Source is Empty

```bash
toduai --format json task list --project "Source"
```

**Expected:** Empty array `[]`.

## Verify Task is in Destination

```bash
toduai --format json task list --project "Destination"
```

**Expected:** Array with one task (the moved one).

## Cleanup

```bash
rm -rf "$TODU_DATA_DIR"
```
