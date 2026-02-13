# Test: Show Habit

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

HABIT=$(toduai --format json habit create --title "Morning run" --schedule "FREQ=DAILY" --timezone "$TZ" --start-date "$TODAY" --description "30 min run before work")
HABIT_ID=$(echo "$HABIT" | jq -r .id)
```

## 1. Show Habit (CLI)

```bash
toduai habit show "$HABIT_ID"
```

**Expected:**

```
ID:          habit-XXXXXXXX
Title:       Morning run
Schedule:    FREQ=DAILY
Timezone:    <local timezone>
Start:       YYYY-MM-DD
Status:      active
Created:     YYYY-MM-DDTHH:MM:SS.MMMZ
Updated:     YYYY-MM-DDTHH:MM:SS.MMMZ

Description:
30 min run before work
```

## 2. Show Streak (CLI)

```bash
toduai habit streak "$HABIT_ID"
```

**Expected:** Streak stats including current streak, longest streak, total check-ins.

## 3. Show History (CLI)

```bash
toduai habit history "$HABIT_ID" --days 7
```

**Expected:** History for last 7 days showing scheduled dates and completion status.

## 4. Verify Electron Detail View

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Habits"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT click "text=Morning run"
NODE_PATH=$NODE_PATH node $INTERACT wait ".detail-title" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-habit-show.png
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".content-area"
```

**Expected:** Detail view shows:
- Title: "Morning run"
- Streak stats (🔥 Current, 📊 Longest, ☐ Check In, 📈 Total)
- Schedule: "Daily"
- Start Date, Next Due, Timezone
- Description: "30 min run before work"
- Last 30 Days history grid
- Toolbar: ⏸ Pause, Delete buttons

## 5. Verify Streak Stats Display

```bash
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".streak-stats"
```

**Expected:** Shows current streak, longest streak, today's check-in status, and total check-ins.

## 6. Verify History Grid

```bash
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelectorAll('.history-day').length"
```

**Expected:** Returns `30` (last 30 days grid).

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODU_DATA_DIR"
```
