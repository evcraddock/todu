# Test: Generate Task from Recurring Template

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
REC=$(toduai --format json recurring create --title "Daily standup" --schedule "FREQ=DAILY" \
  --project "App" --timezone "$TZ" --start-date "$TODAY" --priority high)
REC_ID=$(echo "$REC" | jq -r .id)
```

## 1. View Upcoming Occurrences (CLI)

```bash
toduai recurring upcoming --template "$REC_ID" --days 7 --no-color
```

**Expected:** List of ~7 dates showing upcoming occurrences.

## 2. Generate Task for Specific Date (CLI)

```bash
NEXT_DATE=$(toduai --format json recurring upcoming --template "$REC_ID" --days 7 | jq -r '.[0].date')
toduai recurring generate "$REC_ID" "$NEXT_DATE" --no-color
```

**Expected:** `Generated task: sched-XXXXXXXXXXXX (Daily standup on YYYY-MM-DD)`

## 3. Verify Generated Task Appears in Task List (CLI)

```bash
toduai task list --no-color
```

**Expected:** Shows "Daily standup" as an active task in project "App" with priority=high.

## 4. Verify Electron Shows Generated Task

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Tasks"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** Task list includes "Daily standup" with correct project and priority.

```bash
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-recurring-generate-tasks.png
```

## 5. Generate Task via Electron

Navigate to the recurring template detail and click "Generate" on an upcoming occurrence.

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Recurring"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT click "text=Daily standup"
NODE_PATH=$NODE_PATH node $INTERACT wait ".detail-title" --timeout 5000

# Click "Generate" button on the first upcoming occurrence
NODE_PATH=$NODE_PATH node $INTERACT click ".data-table-compact .btn-secondary"
NODE_PATH=$NODE_PATH node $INTERACT wait ".generated-tag" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table-compact"
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-recurring-generate-electron.png
```

**Expected:** "Generate" button replaced with "✓ Task created: sched-XXXXXXXX…" tag.

## 6. Verify CLI Sees Electron-Generated Task

```bash
toduai task list --no-color
```

**Expected:** Two "Daily standup" tasks — one generated via CLI, one via Electron.

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODUAI_DATA_DIR"
```
