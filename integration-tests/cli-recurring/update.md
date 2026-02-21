# Test: Update Recurring Template

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
toduai project create --name "Infra"
REC=$(toduai --format json recurring create --title "Daily standup" --schedule "FREQ=DAILY" \
  --project "App" --timezone "$TZ" --start-date "$TODAY")
REC_ID=$(echo "$REC" | jq -r .id)
```

## 1. Update Title (CLI)

```bash
toduai recurring update "$REC_ID" --title "Morning sync"
```

**Expected:** Title changed to "Morning sync".

## 2. Update Schedule (CLI)

```bash
toduai recurring update "$REC_ID" --schedule "FREQ=WEEKLY;BYDAY=MO,WE,FR"
```

**Expected:** Schedule changed.

## 3. Update Priority (CLI)

```bash
toduai recurring update "$REC_ID" --priority high
```

**Expected:** Priority changed to high.

## 4. Update Description (CLI)

```bash
toduai recurring update "$REC_ID" --description "3x per week standup"
```

**Expected:** Description updated.

## 5. Move to Different Project (CLI)

```bash
toduai recurring update "$REC_ID" --project "Infra"
```

**Expected:** Project changed to Infra.

## 6. Verify Final State (CLI)

```bash
toduai recurring show "$REC_ID"
```

**Expected:** Title=Morning sync, Schedule=FREQ=WEEKLY;BYDAY=MO,WE,FR, Priority=high, Project=Infra, Description=3x per week standup.

## 7. Verify Electron Reflects CLI Updates

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Recurring"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT click "text=Morning sync"
NODE_PATH=$NODE_PATH node $INTERACT wait ".detail-title" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".content-area"
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-recurring-update-detail.png
```

**Expected:** Detail view shows all updated fields.

## 8. Edit Title Inline in Electron

```bash
NODE_PATH=$NODE_PATH node $INTERACT click ".detail-title"
NODE_PATH=$NODE_PATH node $INTERACT wait ".detail-title-input" --timeout 3000
NODE_PATH=$NODE_PATH node $INTERACT press "Control+a"
NODE_PATH=$NODE_PATH node $INTERACT type "Renamed In Electron"
NODE_PATH=$NODE_PATH node $INTERACT press "Enter"
NODE_PATH=$NODE_PATH node $INTERACT wait ".detail-title.clickable" --timeout 3000
```

## 9. Change Priority via Dropdown in Electron

```bash
NODE_PATH=$NODE_PATH node $INTERACT eval "
  (() => {
    const sel = document.querySelectorAll('.inline-select')[0];
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, 'low');
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return sel.value;
  })()
"
```

**Expected:** Returns `"low"`.

## 10. Change Project via Dropdown in Electron

```bash
NODE_PATH=$NODE_PATH node $INTERACT eval "
  (() => {
    const sel = document.querySelectorAll('.inline-select')[1];
    const opts = Array.from(sel.options);
    const app = opts.find(o => o.text === 'App');
    if (!app) return 'App not found';
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, app.value);
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return sel.value;
  })()
"
```

**Expected:** Returns the project ID for "App".

## 11. Verify CLI Sees Electron Changes

```bash
toduai recurring show "$REC_ID"
```

**Expected:** Title="Renamed In Electron", Priority=low, Project=App.

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODUAI_DATA_DIR"
```
