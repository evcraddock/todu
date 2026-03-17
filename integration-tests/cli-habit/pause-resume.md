# Test: Pause and Resume Habit

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

HABIT=$(todu --format json habit create --title "Morning run" --schedule "FREQ=DAILY" --timezone "$TZ" --start-date "$TODAY")
HABIT_ID=$(echo "$HABIT" | jq -r .id)
```

## 1. Pause Habit (CLI)

```bash
todu habit pause "$HABIT_ID"
```

**Expected:** Habit paused confirmation.

## 2. Verify Paused (CLI)

```bash
todu habit show "$HABIT_ID" | grep "Status"
```

**Expected:** `Status: paused`

## 3. Resume Habit (CLI)

```bash
todu habit resume "$HABIT_ID"
```

**Expected:** Habit resumed confirmation.

## 4. Verify Resumed (CLI)

```bash
todu habit show "$HABIT_ID" | grep "Status"
```

**Expected:** `Status: active`

## 5. Verify Electron Reflects CLI Pause/Resume

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Habits"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** "Morning run" shows status=active.

## 6. Pause via Electron Detail View

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Morning run"
NODE_PATH=$NODE_PATH node $INTERACT wait ".detail-title" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-habit-pause-before.png

# Click "⏸ Pause" button
NODE_PATH=$NODE_PATH node $INTERACT click "text=⏸ Pause"
NODE_PATH=$NODE_PATH node $INTERACT wait "text=▶ Resume" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-habit-pause-after.png
```

**Expected:** Button changes to "▶ Resume". Title shows "paused" badge.

## 7. Verify CLI Sees Electron Pause

```bash
todu habit show "$HABIT_ID" | grep "Status"
```

**Expected:** `Status: paused`

## 8. Resume via Electron

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=▶ Resume"
NODE_PATH=$NODE_PATH node $INTERACT wait "text=⏸ Pause" --timeout 5000
```

**Expected:** Button changes back to "⏸ Pause". Paused badge removed.

## 9. Verify CLI Sees Electron Resume

```bash
todu habit show "$HABIT_ID" | grep "Status"
```

**Expected:** `Status: active`

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODU_DATA_DIR"
```
