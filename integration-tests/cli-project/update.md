# Test: Update Project

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
export NODE_PATH=$(find ~/.npm/_npx -path "*/node_modules/playwright" -type d 2>/dev/null | head -1 | xargs dirname)
export INTERACT=~/.pi/agent/skills/electron-testing/scripts/interact.js

~/.pi/agent/skills/electron-testing/scripts/launch.sh \
  --app-path ./packages/electron/dist/main/index.js \
  --env "TODU_DATA_DIR=$TODU_DATA_DIR"

toduai project create --name "My App" --priority medium
```

## 1. Update Name (CLI)

```bash
toduai project update "My App" --name "My Application"
```

**Expected:**

```
Project updated:
ID:          proj-XXXXXXXX
Name:        My Application
Status:      active
Priority:    medium
Sync:        none
Created:     YYYY-MM-DDTHH:MM:SS.MMMZ
Updated:     YYYY-MM-DDTHH:MM:SS.MMMZ
```

## 2. Update Priority (CLI)

```bash
toduai project update "My Application" --priority high
```

**Expected:** Shows priority changed to `high`.

## 3. Update Status (CLI)

```bash
toduai project update "My Application" --status done
```

**Expected:** Shows status changed to `done`.

## 4. Update Multiple Fields (CLI)

```bash
toduai project update "My Application" --name "Legacy App" --priority low
```

**Expected:** Both name and priority updated.

## 5. Verify Final State (CLI)

```bash
toduai project show "Legacy App"
```

**Expected:** name=Legacy App, status=done, priority=low.

## 6. Verify Electron Reflects Updates

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Projects"
sleep 2
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".content-area"
```

**Expected:** Project list shows "Legacy App" with status "done" and priority "low".

```bash
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-project-update.png
```

**Expected:** Screenshot confirms updated name, status, and priority.

## 7. Update Project in Electron, Verify CLI

Click into project detail view.

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Legacy App"
sleep 1
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-project-update-detail.png
```

**Expected:** Detail view shows "Legacy App" with status=done, priority=low.

### 7a. Edit Name Inline

Click the project name to enter inline edit mode, clear it, and type a new name.

```bash
NODE_PATH=$NODE_PATH node $INTERACT click ".detail-title"
sleep 1
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-project-update-name-edit.png
```

**Expected:** Name field becomes an editable input with current value.

```bash
NODE_PATH=$NODE_PATH node $INTERACT press "Control+a"
NODE_PATH=$NODE_PATH node $INTERACT type "Renamed In Electron"
sleep 1
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-project-update-name-typed.png
```

**Verify:** Input shows "Renamed In Electron". No characters leaked elsewhere.

```bash
NODE_PATH=$NODE_PATH node $INTERACT press "Enter"
sleep 1
```

**Expected:** Inline edit saves and reverts to display mode.

### 7b. Edit Description Inline

Click the description area to enter edit mode and type a description.

```bash
NODE_PATH=$NODE_PATH node $INTERACT click ".detail-description"
sleep 1
NODE_PATH=$NODE_PATH node $INTERACT type "Updated from Electron detail view"
sleep 1
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-project-update-desc-typed.png
```

**Verify:** Textarea shows the full typed text. No characters leaked to the name field. If characters leak, this indicates the focus-stealing bug (#1762).

```bash
NODE_PATH=$NODE_PATH node $INTERACT click ".detail-label"
sleep 1
```

**Expected:** Blur triggers save.

### 7c. Change Priority via Dropdown

```bash
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelectorAll('.inline-select')[1].value"
```

**Expected:** Current priority value (should be "low").

### 7d. Verify CLI Sees All Electron Changes

```bash
toduai project show "Renamed In Electron" --no-color
```

**Expected:**

```
ID:          proj-XXXXXXXX
Name:        Renamed In Electron
Status:      done
Priority:    low
...
Description: Updated from Electron detail view
```

If the name shows garbled text or the description is truncated, this indicates input focus issues.

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODU_DATA_DIR"
```
