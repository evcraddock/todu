# Test: Recurring Template Error Cases

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

## 1. Show Nonexistent Template (CLI)

```bash
todu recurring show "rec-nonexistent"
```

**Expected:** Error — template not found.

## 2. Update Nonexistent Template (CLI)

```bash
todu recurring update "rec-nonexistent" --title "New"
```

**Expected:** Error — template not found.

## 3. Delete Nonexistent Template (CLI)

```bash
todu recurring delete "rec-nonexistent"
```

**Expected:** Error — template not found.

## 4. Pause Nonexistent Template (CLI)

```bash
todu recurring pause "rec-nonexistent"
```

**Expected:** Error — template not found.

## 5. Generate for Nonexistent Template (CLI)

```bash
todu recurring generate "rec-nonexistent" "$TODAY"
```

**Expected:** Error — template not found.

## 6. Create Without Required Fields (CLI)

```bash
todu project create --name "App"
todu recurring create --title "No schedule" --project "App" --timezone "$TZ" --start-date "$TODAY"
```

**Expected:** Error — schedule is required.

```bash
todu recurring create --schedule "FREQ=DAILY" --project "App" --timezone "$TZ" --start-date "$TODAY"
```

**Expected:** Error — title is required.

```bash
todu recurring create --title "No project" --schedule "FREQ=DAILY" --timezone "$TZ" --start-date "$TODAY"
```

**Expected:** Error — project is required.

## 7. Create with Nonexistent Project (CLI)

```bash
todu recurring create --title "Test" --schedule "FREQ=DAILY" --project "Nope" --timezone "$TZ" --start-date "$TODAY"
```

**Expected:** `Project not found: Nope`

## 8. Electron Create — Empty Title Validation

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Recurring"
NODE_PATH=$NODE_PATH node $INTERACT wait ".content-area" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT click "text=+ New Template"
NODE_PATH=$NODE_PATH node $INTERACT wait ".dialog" --timeout 5000

# Try to create without entering a title
NODE_PATH=$NODE_PATH node $INTERACT click ".dialog-actions .btn-primary"
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".dialog"
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-recurring-errors-empty.png
```

**Expected:** Error message "Title is required" shown in dialog.

## 9. Electron Multi-Field Typing — Focus-Stealing Detection

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "#rec-title"
NODE_PATH=$NODE_PATH node $INTERACT type "Test Template"
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('#rec-title').value"
```

**Expected:** Returns `"Test Template"`.

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "#rec-desc"
NODE_PATH=$NODE_PATH node $INTERACT type "Testing focus behavior"
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('#rec-desc').value"
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('#rec-title').value"
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-recurring-errors-typing.png
```

**Expected:**
- Description returns `"Testing focus behavior"`
- Title still returns `"Test Template"` (unchanged)
- If title got corrupted, confirms focus-stealing bug (#1762) in CreateRecurringDialog

```bash
# Close dialog
NODE_PATH=$NODE_PATH node $INTERACT click ".dialog-actions .btn-secondary"
```

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODU_DATA_DIR"
```
