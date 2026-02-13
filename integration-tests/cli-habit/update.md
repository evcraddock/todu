# Test: Update Habit

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
export NODE_PATH=$(find ~/.npm/_npx -path "*/node_modules/playwright" -type d 2>/dev/null | head -1 | xargs dirname)
export INTERACT=~/.pi/agent/skills/electron-testing/scripts/interact.js
TZ=$(cat /etc/timezone 2>/dev/null || echo "America/Chicago")
TODAY=$(date +%Y-%m-%d)

~/.pi/agent/skills/electron-testing/scripts/launch.sh \
  --app-path ./packages/electron/dist/main/index.js \
  --env "TODU_DATA_DIR=$TODU_DATA_DIR"

HABIT=$(toduai --format json habit create --title "Morning run" --schedule "FREQ=DAILY" --timezone "$TZ" --start-date "$TODAY")
HABIT_ID=$(echo "$HABIT" | jq -r .id)
```

## 1. Update Title (CLI)

```bash
toduai habit update "$HABIT_ID" --title "Morning jog"
```

**Expected:** Title changed to "Morning jog".

## 2. Update Schedule (CLI)

```bash
toduai habit update "$HABIT_ID" --schedule "FREQ=WEEKLY;BYDAY=MO,WE,FR"
```

**Expected:** Schedule changed.

## 3. Update Description (CLI)

```bash
toduai habit update "$HABIT_ID" --description "3x per week running"
```

**Expected:** Description updated.

## 4. Verify Final State (CLI)

```bash
toduai habit show "$HABIT_ID"
```

**Expected:** Title=Morning jog, Schedule=FREQ=WEEKLY;BYDAY=MO,WE,FR, Description=3x per week running.

## 5. Verify Electron Reflects CLI Updates

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Habits"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT click "text=Morning jog"
NODE_PATH=$NODE_PATH node $INTERACT wait ".detail-title" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".content-area"
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-habit-update-detail.png
```

**Expected:** Detail view shows updated title, schedule, and description.

## 6. Edit Title Inline in Electron

```bash
NODE_PATH=$NODE_PATH node $INTERACT click ".detail-title"
NODE_PATH=$NODE_PATH node $INTERACT wait ".detail-title-input" --timeout 3000
NODE_PATH=$NODE_PATH node $INTERACT press "Control+a"
NODE_PATH=$NODE_PATH node $INTERACT type "Renamed In Electron"
NODE_PATH=$NODE_PATH node $INTERACT press "Enter"
NODE_PATH=$NODE_PATH node $INTERACT wait ".detail-title.clickable" --timeout 3000
```

## 7. Edit Description Inline in Electron

```bash
NODE_PATH=$NODE_PATH node $INTERACT click ".detail-description"
NODE_PATH=$NODE_PATH node $INTERACT wait ".detail-description-input" --timeout 3000
NODE_PATH=$NODE_PATH node $INTERACT press "Control+a"
NODE_PATH=$NODE_PATH node $INTERACT type "Updated from Electron"
# Blur to save — click another element
NODE_PATH=$NODE_PATH node $INTERACT click ".detail-label"
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-habit-update-inline.png
```

## 8. Verify CLI Sees Electron Changes

```bash
toduai habit show "$HABIT_ID"
```

**Expected:** Title="Renamed In Electron", Description="Updated from Electron".

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODU_DATA_DIR"
```
