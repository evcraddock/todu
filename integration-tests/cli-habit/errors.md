# Test: Habit Error Cases

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

## 1. Show Nonexistent Habit (CLI)

```bash
toduai habit show "habit-nonexistent"
```

**Expected:** Error — habit not found.

## 2. Update Nonexistent Habit (CLI)

```bash
toduai habit update "habit-nonexistent" --title "New"
```

**Expected:** Error — habit not found.

## 3. Delete Nonexistent Habit (CLI)

```bash
toduai habit delete "habit-nonexistent"
```

**Expected:** Error — habit not found.

## 4. Check Nonexistent Habit (CLI)

```bash
toduai habit check "habit-nonexistent"
```

**Expected:** Error — habit not found.

## 5. Pause Nonexistent Habit (CLI)

```bash
toduai habit pause "habit-nonexistent"
```

**Expected:** Error — habit not found.

## 6. Create Without Required Fields (CLI)

```bash
toduai habit create --title "No schedule" --timezone "$TZ" --start-date "$TODAY"
```

**Expected:** Error — schedule is required.

```bash
toduai habit create --schedule "FREQ=DAILY" --timezone "$TZ" --start-date "$TODAY"
```

**Expected:** Error — title is required.

## 7. Electron Create — Empty Title Validation

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Habits"
NODE_PATH=$NODE_PATH node $INTERACT wait ".content-area" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT click "text=+ New Habit"
NODE_PATH=$NODE_PATH node $INTERACT wait ".dialog" --timeout 5000

# Try to create without entering a title
NODE_PATH=$NODE_PATH node $INTERACT click ".dialog-actions .btn-primary"
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".dialog"
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-habit-errors-empty.png
```

**Expected:** Error message "Title is required" shown in dialog. Dialog stays open.

## 8. Electron Multi-Field Typing — Focus-Stealing Detection

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "#habit-title"
NODE_PATH=$NODE_PATH node $INTERACT type "Test Habit"
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('#habit-title').value"
```

**Expected:** Returns `"Test Habit"`.

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "#habit-desc"
NODE_PATH=$NODE_PATH node $INTERACT type "Testing focus behavior"
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('#habit-desc').value"
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('#habit-title').value"
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-habit-errors-typing.png
```

**Expected:**
- Description returns `"Testing focus behavior"`
- Title still returns `"Test Habit"` (unchanged)
- If title got corrupted, confirms focus-stealing bug (#1762) in CreateHabitDialog

```bash
# Close dialog
NODE_PATH=$NODE_PATH node $INTERACT click ".dialog-actions .btn-secondary"
```

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODU_DATA_DIR"
```
