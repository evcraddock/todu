# Test: List Recurring Templates

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

todu project create --name "App"
todu project create --name "Infra"

REC1=$(todu --format json recurring create --title "Daily standup" --schedule "FREQ=DAILY" --project "App" --timezone "$TZ" --start-date "$TODAY")
REC1_ID=$(echo "$REC1" | jq -r .id)
REC2=$(todu --format json recurring create --title "Weekly review" --schedule "FREQ=WEEKLY;BYDAY=FR" --project "App" --timezone "$TZ" --start-date "$TODAY" --priority high)
REC2_ID=$(echo "$REC2" | jq -r .id)
REC3=$(todu --format json recurring create --title "Server backup" --schedule "FREQ=DAILY" --project "Infra" --timezone "$TZ" --start-date "$TODAY")
REC3_ID=$(echo "$REC3" | jq -r .id)

# Pause one
todu recurring pause "$REC3_ID"
```

## 1. List All (CLI)

```bash
todu recurring list --no-color
```

**Expected:** All 3 templates shown. "Server backup" shows as paused.

## 2. List Active Only (CLI)

```bash
todu recurring list --active --no-color
```

**Expected:** Only "Daily standup" and "Weekly review".

## 3. List Paused Only (CLI)

```bash
todu recurring list --paused --no-color
```

**Expected:** Only "Server backup".

## 4. Filter by Project (CLI)

```bash
todu recurring list --project "App" --no-color
```

**Expected:** Only "Daily standup" and "Weekly review".

```bash
todu recurring list --project "Infra" --no-color
```

**Expected:** Only "Server backup".

## 5. Verify Electron Table

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Recurring"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** Table shows all 3 templates with Title, Schedule, Project, Priority, Next Due, Status.

```bash
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-recurring-list.png
```

## 6. Verify Electron Status Filter

```bash
# Filter to "Active only"
NODE_PATH=$NODE_PATH node $INTERACT eval "
  (() => {
    const sel = document.querySelectorAll('.filter-select')[0];
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, 'active');
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return sel.value;
  })()
"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 3000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** Only "Daily standup" and "Weekly review".

```bash
# Reset to all
NODE_PATH=$NODE_PATH node $INTERACT eval "
  (() => {
    const sel = document.querySelectorAll('.filter-select')[0];
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, 'all');
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  })()
"
```

## 7. Verify Electron Project Filter

```bash
# Filter to project "Infra"
NODE_PATH=$NODE_PATH node $INTERACT eval "
  (() => {
    const sel = document.querySelectorAll('.filter-select')[1];
    const opts = Array.from(sel.options);
    const infra = opts.find(o => o.text === 'Infra');
    if (!infra) return 'Infra not found';
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, infra.value);
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return sel.value;
  })()
"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 3000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** Only "Server backup" shown.

```bash
# Reset project filter
NODE_PATH=$NODE_PATH node $INTERACT eval "
  (() => {
    const sel = document.querySelectorAll('.filter-select')[1];
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, '');
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  })()
"
```

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODU_DATA_DIR"
```
