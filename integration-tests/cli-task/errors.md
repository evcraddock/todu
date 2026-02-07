# Test: Task Error Cases

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
```

## Create Task in Nonexistent Project

```bash
todu-new task create --title "Test" --project "Nope"
```

**Expected:**

```
Project not found: Nope
```

Exit code: 1

## Show Nonexistent Task

```bash
todu-new task show "task-nonexistent"
```

**Expected:**

```
Error: task not found: task-nonexistent
```

## Update Nonexistent Task

```bash
todu-new task update "task-nonexistent" --title "New"
```

**Expected:**

```
Error: task not found: task-nonexistent
```

## Delete Nonexistent Task

```bash
todu-new task delete "task-nonexistent"
```

**Expected:**

```
Error: task not found: task-nonexistent
```

## Invalid Status

```bash
todu-new project create --name "App"
todu-new task create --title "Test" --project "App"
todu-new task list --status "invalid"
```

**Expected:**

```
Error: invalid status: invalid
```

## Invalid Priority

```bash
todu-new task list --priority "invalid"
```

**Expected:**

```
Error: invalid priority: invalid
```

## Invalid Sort Field

```bash
todu-new task list --sort "invalid"
```

**Expected:**

```
Error: invalid sort field: invalid
```

## Move to Nonexistent Project

```bash
TASK=$(todu-new --format json task create --title "Stuck" --project "App")
TASK_ID=$(echo "$TASK" | jq -r .id)
todu-new task move "$TASK_ID" "Nowhere"
```

**Expected:**

```
Project not found: Nowhere
```

## Cleanup

```bash
rm -rf "$TODU_DATA_DIR"
```
