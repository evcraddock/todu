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

Click into project detail and edit a field inline.

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Legacy App"
sleep 1
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-project-update-detail.png
```

**Expected:** Detail view shows "Legacy App" with current field values. Note which fields are editable inline and test editing one (e.g., description or name).

After editing in Electron, verify CLI sees the change:

```bash
toduai project show "Legacy App" --no-color
```

**Expected:** CLI output reflects the change made in Electron.

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODU_DATA_DIR"
```
