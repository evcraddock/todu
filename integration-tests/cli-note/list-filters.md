# Test: List Notes with Filters

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
export NODE_PATH=$(find ~/.npm/_npx -path "*/node_modules/playwright" -type d 2>/dev/null | head -1 | xargs dirname)
export INTERACT=~/.pi/agent/skills/electron-testing/scripts/interact.js

~/.pi/agent/skills/electron-testing/scripts/launch.sh \
  --app-path ./packages/electron/dist/main/index.js \
  --env "TODU_DATA_DIR=$TODU_DATA_DIR"

toduai project create --name "App"
toduai project create --name "Infra"
TASK=$(toduai --format json task create --title "Fix bug" --project "App")
TASK_ID=$(echo "$TASK" | jq -r .id)

# Create varied notes
toduai note add "Journal entry" --tag daily
toduai note add "Task progress" --task "$TASK_ID" --tag update
toduai note add "Project decision" --project "App" --tag decision
toduai note add "Agent review" --author agent --tag review
toduai note add "Infra note" --project "Infra"
```

## 1. List All (CLI)

```bash
toduai note list --no-color
```

**Expected:** All 5 notes shown.

## 2. Filter by Task (CLI)

```bash
toduai note list --task "$TASK_ID" --no-color
```

**Expected:** Only "Task progress".

## 3. Filter by Project (CLI)

```bash
toduai note list --project "App" --no-color
```

**Expected:** Only "Project decision".

## 4. Filter by Tag (CLI)

```bash
toduai note list --tag daily --no-color
```

**Expected:** Only "Journal entry".

## 5. Filter by Author (CLI)

```bash
toduai note list --author agent --no-color
```

**Expected:** Only "Agent review".

## 6. List as JSON (CLI)

```bash
toduai --format json note list
```

**Expected:** JSON array of all note objects.

## 7. Empty Results (CLI)

```bash
toduai note list --tag nonexistent --no-color
```

**Expected:** `No results.`

## 8. Verify Electron Shows All Notes

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Notes"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** Table shows all 5 notes with Date, Author, Content, Attached To, Tags columns.

```bash
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-note-filters-all.png
```

## 9. Verify Electron Type Filter

```bash
# Filter to "Standalone" notes only
NODE_PATH=$NODE_PATH node $INTERACT eval "
  (() => {
    const sel = document.querySelectorAll('.filter-select')[0];
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, 'standalone');
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return sel.value;
  })()
"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 3000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-note-filters-standalone.png
```

**Expected:** Only standalone notes shown (Journal entry, Agent review — no entity attachment).

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

## 10. Verify Electron Tag Filter

```bash
# Filter by tag "daily"
NODE_PATH=$NODE_PATH node $INTERACT eval "
  (() => {
    const sel = document.querySelectorAll('.filter-select')[1];
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, 'daily');
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return sel.value;
  })()
"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 3000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-note-filters-tag.png
```

**Expected:** Only "Journal entry" shown (tagged with "daily").

```bash
# Reset tag filter
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
