# Test: Navigation

Verify sidebar navigation between all views.

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

# Create some data so views aren't empty
toduai project create --name "App"
toduai task create --title "Test task" --project "App"
toduai label create --name bug --color "#ff0000"
toduai note add "Test note"
toduai habit create --title "Test habit" --schedule "FREQ=DAILY" --timezone "$TZ" --start-date "$TODAY"
toduai recurring create --title "Test recurring" --schedule "FREQ=DAILY" --project "App" --timezone "$TZ" --start-date "$TODAY"
```

## 1. Navigate to Tasks

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Tasks"
NODE_PATH=$NODE_PATH node $INTERACT wait ".content-area" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".view-title"
```

**Expected:** "Tasks"

## 2. Navigate to Projects

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Projects"
NODE_PATH=$NODE_PATH node $INTERACT wait ".content-area" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".view-title"
```

**Expected:** "Projects"

## 3. Navigate to Habits

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Habits"
NODE_PATH=$NODE_PATH node $INTERACT wait ".content-area" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".view-title"
```

**Expected:** "Habits"

## 4. Navigate to Recurring

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Recurring"
NODE_PATH=$NODE_PATH node $INTERACT wait ".content-area" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".view-title"
```

**Expected:** "Recurring Templates"

## 5. Navigate to Notes

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Notes"
NODE_PATH=$NODE_PATH node $INTERACT wait ".content-area" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".view-title"
```

**Expected:** "Notes"

## 6. Navigate to Labels

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Labels"
NODE_PATH=$NODE_PATH node $INTERACT wait ".content-area" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".view-title"
```

**Expected:** "Labels"

## 7. Detail View and Back Button

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Tasks"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT click "text=Test task"
NODE_PATH=$NODE_PATH node $INTERACT wait ".detail-title" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".detail-title"
```

**Expected:** "Test task"

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=← Back"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".view-title"
```

**Expected:** "Tasks" — returned to list view.

## 8. Rapid Navigation

Click through all views quickly to verify no crashes.

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Projects" 2>&1
NODE_PATH=$NODE_PATH node $INTERACT click "text=Habits" 2>&1
NODE_PATH=$NODE_PATH node $INTERACT click "text=Recurring" 2>&1
NODE_PATH=$NODE_PATH node $INTERACT click "text=Notes" 2>&1
NODE_PATH=$NODE_PATH node $INTERACT click "text=Labels" 2>&1
NODE_PATH=$NODE_PATH node $INTERACT click "text=Tasks" 2>&1
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-lifecycle-nav-rapid.png
```

**Expected:** No errors. Final view shows Tasks with data table.

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODUAI_DATA_DIR"
```
