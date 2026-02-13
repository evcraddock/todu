# Test: List Habits

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

HABIT1=$(toduai --format json habit create --title "Morning run" --schedule "FREQ=DAILY" --timezone "$TZ" --start-date "$TODAY")
HABIT1_ID=$(echo "$HABIT1" | jq -r .id)
HABIT2=$(toduai --format json habit create --title "Weekly review" --schedule "FREQ=WEEKLY;BYDAY=FR" --timezone "$TZ" --start-date "$TODAY")
HABIT2_ID=$(echo "$HABIT2" | jq -r .id)
HABIT3=$(toduai --format json habit create --title "Meditate" --schedule "FREQ=DAILY" --timezone "$TZ" --start-date "$TODAY")
HABIT3_ID=$(echo "$HABIT3" | jq -r .id)

# Pause one habit
toduai habit pause "$HABIT3_ID"
```

## 1. List All (CLI)

```bash
toduai habit list --no-color
```

**Expected:** All 3 habits shown. "Meditate" shows as paused.

## 2. List Active Only (CLI)

```bash
toduai habit list --active --no-color
```

**Expected:** Only "Morning run" and "Weekly review".

## 3. List Paused Only (CLI)

```bash
toduai habit list --paused --no-color
```

**Expected:** Only "Meditate".

## 4. Verify Electron Table

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Habits"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** Table shows all 3 habits with Title, Schedule, Streak, Today, Next Due, Status columns.
- "Meditate" shows status=paused chip

```bash
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-habit-list.png
```

## 5. Verify Electron Status Filter

```bash
# Filter to "Active only"
NODE_PATH=$NODE_PATH node $INTERACT eval "
  (() => {
    const sel = document.querySelector('.filter-select');
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, 'active');
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return sel.value;
  })()
"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 3000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** Only "Morning run" and "Weekly review" shown.

```bash
# Filter to "Paused only"
NODE_PATH=$NODE_PATH node $INTERACT eval "
  (() => {
    const sel = document.querySelector('.filter-select');
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, 'paused');
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return sel.value;
  })()
"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 3000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** Only "Meditate".

```bash
# Reset to all
NODE_PATH=$NODE_PATH node $INTERACT eval "
  (() => {
    const sel = document.querySelector('.filter-select');
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, 'all');
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  })()
"
```

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODU_DATA_DIR"
```
