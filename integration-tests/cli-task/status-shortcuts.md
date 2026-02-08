# Test: Status Shortcuts

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
toduai project create --name "My App"
TASK=$(toduai --format json task create --title "Do the thing" --project "My App")
TASK_ID=$(echo "$TASK" | jq -r .id)
```

## Start a Task

```bash
toduai task start "$TASK_ID"
```

**Expected:**

```
Task inprogress:
ID:          task-XXXXXXXX
Title:       Do the thing
Status:      inprogress
Priority:    medium
Project:     My App
Labels:      (none)
Created:     YYYY-MM-DDTHH:MM:SS.MMMZ
Updated:     YYYY-MM-DDTHH:MM:SS.MMMZ
```

## Complete a Task

```bash
toduai task done "$TASK_ID"
```

**Expected:**

```
Task done:
ID:          task-XXXXXXXX
Title:       Do the thing
Status:      done
...
```

## Reopen and Cancel

```bash
toduai task update "$TASK_ID" --status active
toduai task cancel "$TASK_ID"
```

**Expected:**

```
Task canceled:
ID:          task-XXXXXXXX
Title:       Do the thing
Status:      canceled
...
```

## Invalid Transitions

A done task can only be reopened to active, not directly to inprogress:

```bash
toduai task update "$TASK_ID" --status active
toduai task done "$TASK_ID"
toduai task start "$TASK_ID"
```

**Expected:** The last command should fail because done → inprogress is not a valid transition. The task must be reopened to active first.

## Cleanup

```bash
rm -rf "$TODU_DATA_DIR"
```
