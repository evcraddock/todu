# Test: Create Task

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
export NODE_PATH=$(find ~/.npm/_npx -path "*/node_modules/playwright" -type d 2>/dev/null | head -1 | xargs dirname)
export INTERACT=~/.pi/agent/skills/electron-testing/scripts/interact.js

~/.pi/agent/skills/electron-testing/scripts/launch.sh \
  --app-path ./packages/electron/dist/main/index.js \
  --env "TODU_DATA_DIR=$TODU_DATA_DIR"

toduai project create --name "My App"
```

## 1. Create with Required Fields (CLI)

```bash
toduai task create --title "Fix login bug" --project "My App"
```

**Expected:**

```
Task created:
ID:          task-XXXXXXXX
Title:       Fix login bug
Status:      active
Priority:    medium
Project:     My App
Labels:      (none)
Created:     YYYY-MM-DDTHH:MM:SS.MMMZ
Updated:     YYYY-MM-DDTHH:MM:SS.MMMZ
```

Defaults: status=active, priority=medium.

## 2. Create with All Options (CLI)

```bash
toduai label create --name bug --color "#ff0000"
toduai task create --title "Fix crash" --project "My App" --priority high \
  --description "App crashes on startup" --label bug --due "2026-03-01" --scheduled "2026-02-15"
```

**Expected:** Task created with priority=high, label=bug, due date, scheduled date, and description.

## 3. Create with JSON Output (CLI)

```bash
toduai --format json task create --title "Add tests" --project "My App" --priority low
```

**Expected:** JSON object with id, title, status, priority, projectId, labels, timestamps.

## 4. Verify CLI List

```bash
toduai task list --no-color
```

**Expected:** All three tasks shown in table format.

## 5. Verify Electron Shows CLI-Created Tasks

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Tasks"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".content-area"
```

**Expected:** Output contains "Fix login bug", "Fix crash", and "Add tests".

```bash
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-task-create-cli.png
```

**Expected:** Screenshot shows all three tasks with correct statuses and priorities.

## 6. Create Task in Electron

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=+ New Task"
NODE_PATH=$NODE_PATH node $INTERACT wait ".dialog" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-task-create-dialog.png
```

**Expected:** "New Task" dialog with Title, Project, Priority, Due Date, and Description fields.

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "#task-title"
NODE_PATH=$NODE_PATH node $INTERACT type "Electron Task"
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('#task-title').value"
```

**Expected:** Returns `"Electron Task"`.

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "#task-desc"
NODE_PATH=$NODE_PATH node $INTERACT type "Created via Electron UI"
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('#task-desc').value"
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('#task-title').value"
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-task-create-typed.png
```

**Expected:**
- Description returns `"Created via Electron UI"`
- Title still returns `"Electron Task"` (unchanged)
- If title got corrupted, this confirms the focus-stealing bug (#1762)

```bash
NODE_PATH=$NODE_PATH node $INTERACT click ".dialog-actions .btn-primary"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-task-create-electron.png
```

**Expected:** Dialog closes. Task list now shows 4 tasks including "Electron Task".

## 7. Verify CLI Sees Electron-Created Task

```bash
toduai task list --no-color
```

**Expected:** Four tasks shown, including "Electron Task".

```bash
toduai task search "Electron Task" --no-color
```

**Expected:** Shows "Electron Task" with status=active, priority=medium.

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODU_DATA_DIR"
```
