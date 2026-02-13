# Test: Update Task

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
export NODE_PATH=$(find ~/.npm/_npx -path "*/node_modules/playwright" -type d 2>/dev/null | head -1 | xargs dirname)
export INTERACT=~/.pi/agent/skills/electron-testing/scripts/interact.js

~/.pi/agent/skills/electron-testing/scripts/launch.sh \
  --app-path ./packages/electron/dist/main/index.js \
  --env "TODU_DATA_DIR=$TODU_DATA_DIR"

toduai project create --name "My App"
toduai label create --name bug --color "#ff0000"
TASK=$(toduai --format json task create --title "Fix bug" --project "My App")
TASK_ID=$(echo "$TASK" | jq -r .id)
```

## 1. Update Title (CLI)

```bash
toduai task update "$TASK_ID" --title "Fix critical bug"
```

**Expected:** Shows title changed to "Fix critical bug".

## 2. Update Priority (CLI)

```bash
toduai task update "$TASK_ID" --priority high
```

**Expected:** Shows priority changed to `high`.

## 3. Update Status (CLI)

```bash
toduai task update "$TASK_ID" --status inprogress
```

**Expected:** Shows status changed to `inprogress`.

## 4. Add Label (CLI)

```bash
toduai task update "$TASK_ID" --label bug
```

**Expected:** Shows labels include `bug`.

## 5. Add Due Date (CLI)

```bash
toduai task update "$TASK_ID" --due "2026-03-15"
```

**Expected:** Shows `Due: 2026-03-15`.

## 6. Update Multiple Fields (CLI)

```bash
toduai task update "$TASK_ID" --title "Ship fix" --priority low
```

**Expected:** Both title and priority updated.

## 7. Verify Final State (CLI)

```bash
toduai task show "$TASK_ID"
```

**Expected:** Shows all accumulated changes: title=Ship fix, priority=low, status=inprogress, label=bug, due=2026-03-15.

## 8. Verify Electron Reflects Updates

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Tasks"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** Task list shows "Ship fix" with priority=low, status=inprogress.

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Ship fix"
NODE_PATH=$NODE_PATH node $INTERACT wait ".detail-title" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-task-update-detail.png
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".content-area"
```

**Expected:** Detail view shows title, status, priority, label, and due date matching CLI.

## 9. Update Task in Electron, Verify CLI

### 9a. Edit Title Inline

```bash
NODE_PATH=$NODE_PATH node $INTERACT click ".detail-title"
NODE_PATH=$NODE_PATH node $INTERACT wait ".detail-title-input" --timeout 3000
NODE_PATH=$NODE_PATH node $INTERACT press "Control+a"
NODE_PATH=$NODE_PATH node $INTERACT type "Renamed In Electron"
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-task-update-title-typed.png
```

**Verify:** Input shows "Renamed In Electron". No characters leaked.

```bash
NODE_PATH=$NODE_PATH node $INTERACT press "Enter"
NODE_PATH=$NODE_PATH node $INTERACT wait ".detail-title.clickable" --timeout 3000
```

### 9b. Edit Description Inline

```bash
NODE_PATH=$NODE_PATH node $INTERACT click ".detail-description"
NODE_PATH=$NODE_PATH node $INTERACT wait ".detail-description-input" --timeout 3000
NODE_PATH=$NODE_PATH node $INTERACT type "Description added from Electron"
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-task-update-desc-typed.png
```

**Verify:** Full text in description. No characters leaked to title. If leaked, confirms #1762.

```bash
# Blur to save
NODE_PATH=$NODE_PATH node $INTERACT click ".detail-label"
```

### 9c. Change Priority via Dropdown

```bash
# Inline select dropdowns: [0] = Priority, [1] = Project
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelectorAll('.inline-select')[0].value"
```

**Expected:** Current priority value.

### 9d. Verify CLI Sees Electron Changes

```bash
toduai task show "$TASK_ID" --no-color
```

**Expected:** title="Renamed In Electron", description="Description added from Electron".

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODU_DATA_DIR"
```
