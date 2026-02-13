# Test: Show Recurring Template

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

toduai project create --name "App"
REC=$(toduai --format json recurring create --title "Daily standup" --schedule "FREQ=DAILY" \
  --project "App" --timezone "$TZ" --start-date "$TODAY" --description "Morning sync meeting")
REC_ID=$(echo "$REC" | jq -r .id)
```

## 1. Show Template (CLI)

```bash
toduai recurring show "$REC_ID"
```

**Expected:**

```
ID:          rec-XXXXXXXX
Title:       Daily standup
Schedule:    FREQ=DAILY
             (Daily)
Timezone:    <timezone>
Project:     App
Priority:    medium
Status:      active
Start Date:  YYYY-MM-DD
Next Due:    YYYY-MM-DD
Created:     YYYY-MM-DDTHH:MM:SS.MMMZ
Updated:     YYYY-MM-DDTHH:MM:SS.MMMZ

Description:
Morning sync meeting
```

## 2. Show Upcoming Occurrences (CLI)

```bash
toduai recurring upcoming --template "$REC_ID" --days 7
```

**Expected:** List of dates for the next 7 days (daily schedule = ~7 entries).

## 3. Verify Electron Detail View

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Recurring"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT click "text=Daily standup"
NODE_PATH=$NODE_PATH node $INTERACT wait ".detail-title" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-recurring-show.png
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".content-area"
```

**Expected:** Detail view shows:
- Title: "Daily standup"
- Schedule: "Daily"
- Priority: medium (dropdown)
- Project: App (dropdown)
- Start Date, Next Due, Timezone
- Description: "Morning sync meeting"
- Upcoming Occurrences table (next 30 days)
- Skipped Dates section
- Toolbar: ⏸ Pause, Delete buttons

## 4. Verify Upcoming Occurrences Table in Electron

```bash
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelectorAll('.data-table-compact tbody tr').length"
```

**Expected:** Returns a number > 0 (upcoming occurrences for next 30 days).

```bash
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table-compact"
```

**Expected:** Shows dates with "Generate" buttons for each occurrence.

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODU_DATA_DIR"
```
