# Test: Pause and Resume Recurring Template

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

todu project create --name "App"
REC=$(todu --format json recurring create --title "Daily standup" --schedule "FREQ=DAILY" \
  --project "App" --timezone "$TZ" --start-date "$TODAY")
REC_ID=$(echo "$REC" | jq -r .id)
```

## 1. Pause Template (CLI)

```bash
todu recurring pause "$REC_ID"
```

**Expected:** `Paused recurring template: rec-XXXXXXXX`

## 2. Verify Paused (CLI)

```bash
todu recurring show "$REC_ID" | grep "Status"
```

**Expected:** `Status: paused`

## 3. Resume Template (CLI)

```bash
todu recurring resume "$REC_ID"
```

**Expected:** `Resumed recurring template: rec-XXXXXXXX`

## 4. Verify Resumed (CLI)

```bash
todu recurring show "$REC_ID" | grep "Status"
```

**Expected:** `Status: active`

## 5. Verify Electron Reflects CLI State

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Recurring"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** "Daily standup" shows status=active.

## 6. Pause via Electron Detail View

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Daily standup"
NODE_PATH=$NODE_PATH node $INTERACT wait ".detail-title" --timeout 5000

NODE_PATH=$NODE_PATH node $INTERACT click "text=⏸ Pause"
NODE_PATH=$NODE_PATH node $INTERACT wait "text=▶ Resume" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-recurring-paused.png
```

**Expected:** Button changes to "▶ Resume". Title shows "paused" badge.

## 7. Verify CLI Sees Electron Pause

```bash
todu recurring show "$REC_ID" | grep "Status"
```

**Expected:** `Status: paused`

## 8. Resume via Electron

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=▶ Resume"
NODE_PATH=$NODE_PATH node $INTERACT wait "text=⏸ Pause" --timeout 5000
```

**Expected:** Button changes back to "⏸ Pause".

## 9. Verify CLI Sees Electron Resume

```bash
todu recurring show "$REC_ID" | grep "Status"
```

**Expected:** `Status: active`

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODU_DATA_DIR"
```
