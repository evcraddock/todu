# Test: List Tasks with Filters

## Setup

```bash
export TODUAI_DATA_DIR=$(mktemp -d)
export NODE_PATH=$(find ~/.npm/_npx -path "*/node_modules/playwright" -type d 2>/dev/null | head -1 | xargs dirname)
export INTERACT=~/.pi/agent/skills/electron-testing/scripts/interact.js

~/.pi/agent/skills/electron-testing/scripts/launch.sh \
  --app-path ./packages/electron/dist/main/index.js \
  --env "TODUAI_DATA_DIR=$TODUAI_DATA_DIR"

toduai project create --name "App"
toduai project create --name "Infra"
toduai label create --name bug --color "#ff0000"
toduai label create --name feature --color "#00ff00"

# Create varied tasks
toduai --format json task create --title "Fix crash" --project "App" --priority high --label bug --due "2020-01-01"
toduai --format json task create --title "Add search" --project "App" --priority medium --label feature --due "$(date +%Y-%m-%d)"
TASK3=$(toduai --format json task create --title "Setup CI" --project "Infra" --priority low)
TASK3_ID=$(echo "$TASK3" | jq -r .id)
toduai task start "$TASK3_ID"
toduai --format json task create --title "Write docs" --project "App" --priority low --scheduled "$(date +%Y-%m-%d)"
TASK5=$(toduai --format json task create --title "Old task" --project "App" --priority medium)
TASK5_ID=$(echo "$TASK5" | jq -r .id)
toduai task done "$TASK5_ID"
```

## 1. List All (CLI)

```bash
toduai task list --no-color
```

**Expected:** All 5 tasks shown, sorted by priority desc then createdAt desc.

## 2. Filter by Status (CLI)

```bash
toduai task list --status active --no-color
```

**Expected:** Only tasks with status=active (Fix crash, Add search, Write docs).

## 3. Filter by Multiple Statuses (CLI)

```bash
toduai task list --status active,inprogress --no-color
```

**Expected:** Tasks that are active or inprogress (Fix crash, Add search, Setup CI, Write docs).

## 4. Filter by Priority (CLI)

```bash
toduai task list --priority high --no-color
```

**Expected:** Only "Fix crash".

## 5. Filter by Project (CLI)

```bash
toduai task list --project "Infra" --no-color
```

**Expected:** Only "Setup CI".

## 6. Filter by Label (CLI)

```bash
toduai task list --label bug --no-color
```

**Expected:** Only "Fix crash".

## 7. Filter Overdue (CLI)

```bash
toduai task list --overdue --no-color
```

**Expected:** Only "Fix crash" (due 2020-01-01, still active).

## 8. Filter Today (CLI)

```bash
toduai task list --today --no-color
```

**Expected:** "Add search" (due today) and "Write docs" (scheduled today).

## 9. Combined Filters (CLI)

```bash
toduai task list --status active --priority medium --no-color
```

**Expected:** Only "Add search" (active + medium priority). "Old task" is medium but done.

## 10. List as JSON (CLI)

```bash
toduai --format json task list --status active
```

**Expected:** JSON array of task objects with status=active.

## 11. Verify Electron Shows All Tasks

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Tasks"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".content-area"
```

**Expected:** All 5 tasks visible with correct statuses and priorities.

```bash
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-task-filters-all.png
```

## 12. Verify Electron Filter Chips

Test the status filter chips in the Electron UI.

```bash
# Click the "active" status chip to filter
NODE_PATH=$NODE_PATH node $INTERACT click "text=active"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-task-filters-active.png
```

**Expected:** Only active tasks shown (Fix crash, Add search, Write docs).

## 13. Verify Electron Overdue Highlight

```bash
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-task-filters-overdue.png
```

**Expected:** "Fix crash" due date (2020-01-01) should be highlighted in red as overdue.

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODUAI_DATA_DIR"
```
