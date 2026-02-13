# Test: Create Habit

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
```

## 1. Create Daily Habit (CLI)

```bash
toduai habit create --title "Morning run" --schedule "FREQ=DAILY" --timezone "$TZ" --start-date "$TODAY"
```

**Expected:**

```
Created habit: hab-XXXXXXXX
Title:     Morning run
Schedule:  FREQ=DAILY (Daily)
Timezone:  <local timezone>
Status:    active
Start:     YYYY-MM-DD
Next Due:  YYYY-MM-DD
Created:   YYYY-MM-DDTHH:MM:SS.MMMZ
```

## 2. Create Weekly Habit (CLI)

```bash
toduai habit create --title "Weekly review" --schedule "FREQ=WEEKLY;BYDAY=FR" --timezone "$TZ" --start-date "$TODAY" --description "End of week reflection"
```

**Expected:** Habit created with weekly Friday schedule and description.

## 3. Create with Custom Start Date (CLI)

```bash
toduai habit create --title "Read 30 mins" --schedule "FREQ=DAILY" --timezone "$TZ" --start-date "2026-01-01"
```

**Expected:** Start date shows 2026-01-01.

## 4. Create with JSON Output (CLI)

```bash
toduai --format json habit create --title "Meditate" --schedule "FREQ=DAILY" --timezone "$TZ" --start-date "$TODAY"
```

**Expected:** JSON object with id, title, schedule, timezone, startDate, createdAt.

## 5. Verify CLI List

```bash
toduai habit list --no-color
```

**Expected:** All 4 habits shown.

## 6. Verify Electron Shows CLI-Created Habits

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Habits"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** Table with columns: Title, Schedule, Streak, Today, Next Due, Status.
All 4 habits visible with status=active.

```bash
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-habit-create-list.png
```

## 7. Create Habit in Electron

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=+ New Habit"
NODE_PATH=$NODE_PATH node $INTERACT wait ".dialog" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-habit-create-dialog.png
```

**Expected:** "New Habit" dialog with Title, Schedule (preset picker), Start/End Date, Description.

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "#habit-title"
NODE_PATH=$NODE_PATH node $INTERACT type "Electron Habit"
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('#habit-title').value"
```

**Expected:** Returns `"Electron Habit"`.

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "#habit-desc"
NODE_PATH=$NODE_PATH node $INTERACT type "Created via Electron"
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('#habit-desc').value"
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('#habit-title').value"
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-habit-create-typed.png
```

**Expected:**
- Description returns `"Created via Electron"`
- Title still returns `"Electron Habit"` (unchanged)
- If title got corrupted, confirms focus-stealing bug (#1762) in CreateHabitDialog

```bash
NODE_PATH=$NODE_PATH node $INTERACT click ".dialog-actions .btn-primary"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** Dialog closes. Table now shows 5 habits including "Electron Habit".

## 8. Verify CLI Sees Electron-Created Habit

```bash
toduai habit list --no-color
```

**Expected:** Five habits shown, including "Electron Habit".

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODU_DATA_DIR"
```
