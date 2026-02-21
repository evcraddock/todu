# Test: Delete Habit

## Setup

```bash
export TODUAI_DATA_DIR=$(mktemp -d)
export NODE_PATH=$(find ~/.npm/_npx -path "*/node_modules/playwright" -type d 2>/dev/null | head -1 | xargs dirname)
export INTERACT=~/.pi/agent/skills/electron-testing/scripts/interact.js
TZ=$(cat /etc/timezone 2>/dev/null || echo "America/Chicago")
TODAY=$(date +%Y-%m-%d)

~/.pi/agent/skills/electron-testing/scripts/launch.sh \
  --app-path ./packages/electron/dist/main/index.js \
  --env "TODUAI_DATA_DIR=$TODUAI_DATA_DIR"

HABIT1=$(toduai --format json habit create --title "Delete me" --schedule "FREQ=DAILY" --timezone "$TZ" --start-date "$TODAY")
HABIT1_ID=$(echo "$HABIT1" | jq -r .id)
HABIT2=$(toduai --format json habit create --title "Keep me" --schedule "FREQ=DAILY" --timezone "$TZ" --start-date "$TODAY")
HABIT2_ID=$(echo "$HABIT2" | jq -r .id)
HABIT3=$(toduai --format json habit create --title "Electron delete" --schedule "FREQ=DAILY" --timezone "$TZ" --start-date "$TODAY")
HABIT3_ID=$(echo "$HABIT3" | jq -r .id)
```

## 1. Delete Habit (CLI)

```bash
toduai habit delete "$HABIT1_ID"
```

**Expected:** `Deleted habit: hab-XXXXXXXX`

## 2. Verify Deleted (CLI)

```bash
toduai habit show "$HABIT1_ID"
```

**Expected:** Error — habit not found.

## 3. Verify Not in List (CLI)

```bash
toduai habit list --no-color
```

**Expected:** Only "Keep me" and "Electron delete" shown.

## 4. Verify Electron Reflects CLI Deletion

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Habits"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** Only "Keep me" and "Electron delete" in table.

## 5. Delete Habit from Electron

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Electron delete"
NODE_PATH=$NODE_PATH node $INTERACT wait ".detail-title" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT click "text=Delete"
NODE_PATH=$NODE_PATH node $INTERACT wait ".dialog" --timeout 3000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".dialog"
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-habit-delete-confirm.png
```

**Expected:** ConfirmDialog: "Delete 'Electron delete'? All check-in history will be lost. This cannot be undone."

```bash
NODE_PATH=$NODE_PATH node $INTERACT click ".dialog-actions .btn-danger"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** Returns to habit list. Only "Keep me" remains.

## 6. Verify CLI Sees Electron Deletion

```bash
toduai habit list --no-color
```

**Expected:** Only "Keep me" shown.

```bash
toduai habit show "$HABIT3_ID"
```

**Expected:** Error — habit not found.

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODUAI_DATA_DIR"
```
