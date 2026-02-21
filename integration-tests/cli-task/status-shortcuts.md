# Test: Status Shortcuts

## Setup

```bash
export TODUAI_DATA_DIR=$(mktemp -d)
export NODE_PATH=$(find ~/.npm/_npx -path "*/node_modules/playwright" -type d 2>/dev/null | head -1 | xargs dirname)
export INTERACT=~/.pi/agent/skills/electron-testing/scripts/interact.js

~/.pi/agent/skills/electron-testing/scripts/launch.sh \
  --app-path ./packages/electron/dist/main/index.js \
  --env "TODUAI_DATA_DIR=$TODUAI_DATA_DIR"

toduai project create --name "My App"
TASK=$(toduai --format json task create --title "Do the thing" --project "My App")
TASK_ID=$(echo "$TASK" | jq -r .id)
```

## 1. Start a Task (CLI)

```bash
toduai task start "$TASK_ID"
```

**Expected:**

```
Task inprogress:
ID:          task-XXXXXXXX
Title:       Do the thing
Status:      inprogress
...
```

## 2. Complete a Task (CLI)

```bash
toduai task done "$TASK_ID"
```

**Expected:** Status changes to `done`.

## 3. Reopen and Cancel (CLI)

```bash
toduai task update "$TASK_ID" --status active
toduai task cancel "$TASK_ID"
```

**Expected:** Status changes to `canceled`.

## 4. Invalid Transitions (CLI)

```bash
toduai task update "$TASK_ID" --status active
toduai task done "$TASK_ID"
toduai task start "$TASK_ID"
```

**Expected:** Last command should fail — done → inprogress is not valid. Must reopen to active first.

## 5. Verify Electron Shows Status Changes

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Tasks"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-task-status-list.png
```

**Expected:** Task shows current status in the table.

## 6. Use Electron Status Shortcuts

Click into the task detail and use the status shortcut buttons.

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Do the thing"
NODE_PATH=$NODE_PATH node $INTERACT wait ".detail-title" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-task-status-detail.png
```

**Expected:** Detail view shows status shortcuts (Start, Done, Cancel, Reopen — depending on current state).

```bash
# Click "Start" to set inprogress (only visible if current status is active)
NODE_PATH=$NODE_PATH node $INTERACT click ".status-shortcuts >> text=Start"
NODE_PATH=$NODE_PATH node $INTERACT wait ".status-btn-done" --timeout 3000
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-task-status-started.png
```

**Expected:** Status changes to inprogress. Available shortcuts update (Done, Cancel visible; Start gone).

```bash
# Verify CLI sees the change
toduai task show "$TASK_ID" --no-color | grep "Status"
```

**Expected:** `Status: inprogress`

```bash
# Click "Done"
NODE_PATH=$NODE_PATH node $INTERACT click ".status-shortcuts >> text=Done"
NODE_PATH=$NODE_PATH node $INTERACT wait ".status-btn-active" --timeout 3000
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-task-status-done.png
```

**Expected:** Status changes to done. "Reopen" shortcut visible.

```bash
toduai task show "$TASK_ID" --no-color | grep "Status"
```

**Expected:** `Status: done`

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODUAI_DATA_DIR"
```
