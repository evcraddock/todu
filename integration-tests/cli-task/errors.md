# Test: Task Error Cases

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
export NODE_PATH=$(find ~/.npm/_npx -path "*/node_modules/playwright" -type d 2>/dev/null | head -1 | xargs dirname)
export INTERACT=~/.pi/agent/skills/electron-testing/scripts/interact.js

~/.pi/agent/skills/electron-testing/scripts/launch.sh \
  --app-path ./packages/electron/dist/main/index.js \
  --env "TODU_DATA_DIR=$TODU_DATA_DIR"
```

## 1. Create Task in Nonexistent Project (CLI)

```bash
toduai task create --title "Test" --project "Nope"
```

**Expected:** `Project not found: Nope`. Exit code: 1.

## 2. Show Nonexistent Task (CLI)

```bash
toduai task show "task-nonexistent"
```

**Expected:** `Error: task not found: task-nonexistent`

## 3. Update Nonexistent Task (CLI)

```bash
toduai task update "task-nonexistent" --title "New"
```

**Expected:** `Error: task not found: task-nonexistent`

## 4. Delete Nonexistent Task (CLI)

```bash
toduai task delete "task-nonexistent"
```

**Expected:** `Error: task not found: task-nonexistent`

## 5. Invalid Status (CLI)

```bash
toduai project create --name "App"
toduai task create --title "Test" --project "App"
toduai task list --status "invalid"
```

**Expected:** `Error: invalid status: invalid`

## 6. Invalid Priority (CLI)

```bash
toduai task list --priority "invalid"
```

**Expected:** `Error: invalid priority: invalid`

## 7. Invalid Sort Field (CLI)

```bash
toduai task list --sort "invalid"
```

**Expected:** `Error: invalid sort field: invalid`

## 8. Move to Nonexistent Project (CLI)

```bash
TASK=$(toduai --format json task create --title "Stuck" --project "App")
TASK_ID=$(echo "$TASK" | jq -r .id)
toduai task move "$TASK_ID" "Nowhere"
```

**Expected:** `Project not found: Nowhere`

## 9. Electron Empty State

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Tasks"
NODE_PATH=$NODE_PATH node $INTERACT wait ".content-area" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-task-errors-list.png
```

**Expected:** Tasks view shows the tasks created above (Test, Stuck) — or if filters hide them, shows empty state message.

## 10. Electron Create Task — Multi-Field Typing

Test that typing flows correctly across title and description fields.

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=+ New Task"
NODE_PATH=$NODE_PATH node $INTERACT wait ".dialog" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT click "#task-title"
NODE_PATH=$NODE_PATH node $INTERACT type "Error Test Task"
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('#task-title').value"
```

**Expected:** Returns `"Error Test Task"`.

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "#task-desc"
NODE_PATH=$NODE_PATH node $INTERACT type "Testing focus behavior across fields"
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('#task-desc').value"
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('#task-title').value"
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-task-errors-typing.png
```

**Expected:**
- Description returns `"Testing focus behavior across fields"`
- Title still returns `"Error Test Task"` (unchanged)
- If title got corrupted, confirms focus-stealing bug (#1762)

```bash
NODE_PATH=$NODE_PATH node $INTERACT press "Escape"
```

**Expected:** Dialog closes.

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODU_DATA_DIR"
```
