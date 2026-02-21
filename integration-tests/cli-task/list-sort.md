# Test: List Tasks with Sorting

## Setup

```bash
export TODUAI_DATA_DIR=$(mktemp -d)
export NODE_PATH=$(find ~/.npm/_npx -path "*/node_modules/playwright" -type d 2>/dev/null | head -1 | xargs dirname)
export INTERACT=~/.pi/agent/skills/electron-testing/scripts/interact.js

~/.pi/agent/skills/electron-testing/scripts/launch.sh \
  --app-path ./packages/electron/dist/main/index.js \
  --env "TODUAI_DATA_DIR=$TODUAI_DATA_DIR"

toduai project create --name "App"

toduai task create --title "Charlie" --project "App" --priority low --due "2026-06-01"
toduai task create --title "Alpha" --project "App" --priority high --due "2026-01-01"
toduai task create --title "Bravo" --project "App" --priority medium
```

## 1. Default Sort — Priority Desc (CLI)

```bash
toduai task list --no-color
```

**Expected:** Alpha (high), Bravo (medium), Charlie (low).

## 2. Sort by Title Ascending (CLI)

```bash
toduai task list --sort title --asc --no-color
```

**Expected:** Alpha, Bravo, Charlie.

## 3. Sort by Title Descending (CLI)

```bash
toduai task list --sort title --no-color
```

**Expected:** Charlie, Bravo, Alpha.

## 4. Sort by Due Date Ascending (CLI)

```bash
toduai task list --sort dueDate --asc --no-color
```

**Expected:** Alpha (2026-01-01), Charlie (2026-06-01), Bravo (no due — last).

## 5. Sort by Due Date Descending (CLI)

```bash
toduai task list --sort dueDate --no-color
```

**Expected:** Charlie (2026-06-01), Alpha (2026-01-01), Bravo (no due — last).

Tasks without a due date always sort last regardless of direction.

## 6. Sort by Priority Ascending (CLI)

```bash
toduai task list --sort priority --asc --no-color
```

**Expected:** Charlie (low), Bravo (medium), Alpha (high).

## 7. Verify Electron Column Header Sort

Click column headers in the Electron task table to toggle sort.

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Tasks"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-task-sort-default.png
```

**Expected:** Tasks displayed in the table.

```bash
# Click TITLE header to sort by title
NODE_PATH=$NODE_PATH node $INTERACT click "th >> text=TITLE"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 3000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-task-sort-title.png
```

**Expected:** Tasks sorted by title (Alpha, Bravo, Charlie or reverse depending on default direction).

```bash
# Click PRIORITY header to sort by priority
NODE_PATH=$NODE_PATH node $INTERACT click "th >> text=PRIORITY"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 3000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-task-sort-priority.png
```

**Expected:** Tasks sorted by priority.

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODUAI_DATA_DIR"
```
