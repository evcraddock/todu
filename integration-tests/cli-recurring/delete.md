# Test: Delete Recurring Template

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

toduai project create --name "App"
REC1=$(toduai --format json recurring create --title "Delete me" --schedule "FREQ=DAILY" \
  --project "App" --timezone "$TZ" --start-date "$TODAY")
REC1_ID=$(echo "$REC1" | jq -r .id)
REC2=$(toduai --format json recurring create --title "Keep me" --schedule "FREQ=DAILY" \
  --project "App" --timezone "$TZ" --start-date "$TODAY")
REC2_ID=$(echo "$REC2" | jq -r .id)
REC3=$(toduai --format json recurring create --title "Electron delete" --schedule "FREQ=DAILY" \
  --project "App" --timezone "$TZ" --start-date "$TODAY")
REC3_ID=$(echo "$REC3" | jq -r .id)
```

## 1. Delete Template (CLI)

```bash
toduai recurring delete "$REC1_ID"
```

**Expected:** `Deleted recurring template: rec-XXXXXXXX`

## 2. Verify Deleted (CLI)

```bash
toduai recurring show "$REC1_ID"
```

**Expected:** Error — template not found.

## 3. Verify Not in List (CLI)

```bash
toduai recurring list --no-color
```

**Expected:** Only "Keep me" and "Electron delete".

## 4. Verify Electron Reflects CLI Deletion

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Recurring"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** Only "Keep me" and "Electron delete" in table.

## 5. Delete Template from Electron

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Electron delete"
NODE_PATH=$NODE_PATH node $INTERACT wait ".detail-title" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT click "text=Delete"
NODE_PATH=$NODE_PATH node $INTERACT wait ".dialog" --timeout 3000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".dialog"
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-recurring-delete-confirm.png
```

**Expected:** ConfirmDialog: "Delete 'Electron delete'? This cannot be undone. Existing generated tasks will not be affected."

```bash
NODE_PATH=$NODE_PATH node $INTERACT click ".dialog-actions .btn-danger"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** Returns to list. Only "Keep me" remains.

## 6. Verify CLI Sees Electron Deletion

```bash
toduai recurring list --no-color
```

**Expected:** Only "Keep me" shown.

```bash
toduai recurring show "$REC3_ID"
```

**Expected:** Error — template not found.

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODUAI_DATA_DIR"
```
