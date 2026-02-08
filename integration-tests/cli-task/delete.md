# Test: Delete Task

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
toduai project create --name "App"
TASK=$(toduai --format json task create --title "Delete me" --project "App")
TASK_ID=$(echo "$TASK" | jq -r .id)
```

## Delete Task

```bash
toduai task delete "$TASK_ID"
```

**Expected:**

```
Deleted task: task-XXXXXXXX
```

## Verify Deleted

```bash
toduai task show "$TASK_ID"
```

**Expected:**

```
Error: task not found: task-XXXXXXXX
```

## Verify Not in List

```bash
toduai --format json task list --project "App"
```

**Expected:** Empty array `[]`.

## Cleanup

```bash
rm -rf "$TODU_DATA_DIR"
```
