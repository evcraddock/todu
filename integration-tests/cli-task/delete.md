# Test: Delete Task

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
export NODE_PATH=$(find ~/.npm/_npx -path "*/node_modules/playwright" -type d 2>/dev/null | head -1 | xargs dirname)
export INTERACT=~/.pi/agent/skills/electron-testing/scripts/interact.js

~/.pi/agent/skills/electron-testing/scripts/launch.sh \
  --app-path ./packages/electron/dist/main/index.js \
  --env "TODU_DATA_DIR=$TODU_DATA_DIR"

toduai project create --name "App"
TASK1=$(toduai --format json task create --title "Delete me" --project "App")
TASK1_ID=$(echo "$TASK1" | jq -r .id)
TASK2=$(toduai --format json task create --title "Keep me" --project "App")
TASK2_ID=$(echo "$TASK2" | jq -r .id)
```

## 1. Delete Task (CLI)

```bash
toduai task delete "$TASK1_ID"
```

**Expected:**

```
Deleted task: task-XXXXXXXX
```

## 2. Verify Deleted (CLI)

```bash
toduai task show "$TASK1_ID"
```

**Expected:** `Error: task not found: task-XXXXXXXX`

## 3. Verify Not in List (CLI)

```bash
toduai task list --no-color
```

**Expected:** Only "Keep me" shown.

## 4. Verify Electron Reflects Deletion

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Tasks"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-task-delete.png
```

**Expected:** Only "Keep me" in the task list. "Delete me" is gone.

## 5. Delete Task from Electron

Click into "Keep me" detail and delete via the Delete button.

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Keep me"
NODE_PATH=$NODE_PATH node $INTERACT wait ".detail-title" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT click "text=Delete"
NODE_PATH=$NODE_PATH node $INTERACT wait ".dialog" --timeout 3000
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-task-delete-confirm.png
```

**Expected:** Delete confirmation dialog appears: "Delete 'Keep me'? This cannot be undone."

```bash
# Confirm deletion
NODE_PATH=$NODE_PATH node $INTERACT click ".dialog-actions .btn-danger"
NODE_PATH=$NODE_PATH node $INTERACT wait ".empty-state" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-task-delete-empty.png
```

**Expected:** Returns to task list. Empty state: "No tasks match your filters".

## 6. Verify CLI Sees Electron Deletion

```bash
toduai task list --no-color
```

**Expected:** `No results.` or empty table.

```bash
toduai task show "$TASK2_ID"
```

**Expected:** `Error: task not found: task-XXXXXXXX`

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODU_DATA_DIR"
```
