# Test: Create Recurring Template

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
toduai project create --name "Infra"
```

## 1. Create Daily Template (CLI)

```bash
toduai recurring create --title "Daily standup" --schedule "FREQ=DAILY" --project "App" --timezone "$TZ" --start-date "$TODAY"
```

**Expected:**

```
Created recurring template: rec-XXXXXXXX
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
```

## 2. Create Weekly Template with All Options (CLI)

```bash
toduai label create --name meetings --color "#3b82f6"
toduai recurring create --title "Weekly review" --schedule "FREQ=WEEKLY;BYDAY=FR" \
  --project "App" --timezone "$TZ" --start-date "$TODAY" \
  --priority high --description "End of week reflection" --label meetings
```

**Expected:** Template created with priority=high, label=meetings, description.

## 3. Create with JSON Output (CLI)

```bash
toduai --format json recurring create --title "Monthly report" --schedule "FREQ=MONTHLY;BYMONTHDAY=1" \
  --project "Infra" --timezone "$TZ" --start-date "$TODAY" --priority low
```

**Expected:** JSON object with id, title, schedule, projectId, priority, timezone, startDate, etc.

## 4. Verify CLI List

```bash
toduai recurring list --no-color
```

**Expected:** All 3 templates shown with Title, Schedule, Project, Priority, Next Due, Status.

## 5. Verify Electron Shows CLI-Created Templates

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Recurring"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** Table shows all 3 templates: Daily standup (App/medium), Weekly review (App/high), Monthly report (Infra/low).

```bash
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-recurring-create-list.png
```

## 6. Create Template in Electron

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=+ New Template"
NODE_PATH=$NODE_PATH node $INTERACT wait ".dialog" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-recurring-create-dialog.png
```

**Expected:** "New Recurring Template" dialog with Title, Schedule, Project, Priority, Start/End Date, Description.

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "#rec-title"
NODE_PATH=$NODE_PATH node $INTERACT type "Electron Template"
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('#rec-title').value"
```

**Expected:** Returns `"Electron Template"`.

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "#rec-desc"
NODE_PATH=$NODE_PATH node $INTERACT type "Created via Electron"
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('#rec-desc').value"
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('#rec-title').value"
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-recurring-create-typed.png
```

**Expected:**
- Description returns `"Created via Electron"`
- Title still returns `"Electron Template"` (unchanged)
- If title got corrupted, confirms focus-stealing bug (#1762)

```bash
NODE_PATH=$NODE_PATH node $INTERACT click ".dialog-actions .btn-primary"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** Dialog closes. Table now shows 4 templates including "Electron Template".

## 7. Verify CLI Sees Electron-Created Template

```bash
toduai recurring list --no-color
```

**Expected:** Four templates shown, including "Electron Template".

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODU_DATA_DIR"
```
