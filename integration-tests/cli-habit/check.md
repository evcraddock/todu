# Test: Check-In and Uncheck

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

## 1. Check In for Today (CLI)

```bash
toduai habit check "$HABIT_ID"
```

**Expected:** Check-in confirmed for today's date.

## 2. Verify Streak Updated (CLI)

```bash
toduai habit streak "$HABIT_ID"
```

**Expected:** Current streak = 1, total check-ins = 1.

## 3. Verify Electron Reflects Check-In

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Habits"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** "Morning run" row shows 🔥 1 streak and ✅ in Today column.

```bash
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-habit-check-list.png
```

## 4. Uncheck Today (CLI)

```bash
toduai habit uncheck "$HABIT_ID"
```

**Expected:** Today's check-in removed.

## 5. Verify Streak Reset (CLI)

```bash
toduai habit streak "$HABIT_ID"
```

**Expected:** Current streak = 0, total check-ins = 0.

## 6. Check In via Electron (List Toggle)

Click the check-in toggle in the habit list table.

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Habits"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT click ".checkin-pending"
NODE_PATH=$NODE_PATH node $INTERACT wait ".checkin-done" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-habit-check-toggle.png
```

**Expected:** Toggle changes from "—" to "✅". Streak updates.

## 7. Verify CLI Sees Electron Check-In

```bash
toduai habit streak "$HABIT_ID"
```

**Expected:** Current streak = 1, total check-ins = 1.

## 8. Uncheck via Electron (List Toggle)

```bash
NODE_PATH=$NODE_PATH node $INTERACT click ".checkin-done"
NODE_PATH=$NODE_PATH node $INTERACT wait ".checkin-pending" --timeout 5000
```

**Expected:** Toggle reverts to "—".

## 9. Check In via Electron (Detail View)

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Morning run"
NODE_PATH=$NODE_PATH node $INTERACT wait ".streak-stats" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT click ".streak-checkin-btn"
NODE_PATH=$NODE_PATH node $INTERACT wait ".checkin-done" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".streak-stats"
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-habit-check-detail.png
```

**Expected:** Button changes to "✅ Done". Streak stats update.

## 10. Verify CLI Sees Detail Check-In

```bash
toduai habit streak "$HABIT_ID"
```

**Expected:** Current streak = 1, total check-ins = 1.

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODU_DATA_DIR"
```
