# Test: Task Error Cases

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
```

## Create Task in Nonexistent Project

```bash
toduai task create --title "Test" --project "Nope"
```

**Expected:**

```
Project not found: Nope
```

Exit code: 1

## Show Nonexistent Task

```bash
toduai task show "task-nonexistent"
```

**Expected:**

```
Error: task not found: task-nonexistent
```

## Update Nonexistent Task

```bash
toduai task update "task-nonexistent" --title "New"
```

**Expected:**

```
Error: task not found: task-nonexistent
```

## Delete Nonexistent Task

```bash
toduai task delete "task-nonexistent"
```

**Expected:**

```
Error: task not found: task-nonexistent
```

## Invalid Status

```bash
toduai project create --name "App"
toduai task create --title "Test" --project "App"
toduai task list --status "invalid"
```

**Expected:**

```
Error: invalid status: invalid
```

## Invalid Priority

```bash
toduai task list --priority "invalid"
```

**Expected:**

```
Error: invalid priority: invalid
```

## Invalid Sort Field

```bash
toduai task list --sort "invalid"
```

**Expected:**

```
Error: invalid sort field: invalid
```

## Move to Nonexistent Project

```bash
TASK=$(toduai --format json task create --title "Stuck" --project "App")
TASK_ID=$(echo "$TASK" | jq -r .id)
toduai task move "$TASK_ID" "Nowhere"
```

**Expected:**

```
Project not found: Nowhere
```

## Cleanup

```bash
rm -rf "$TODU_DATA_DIR"
```
