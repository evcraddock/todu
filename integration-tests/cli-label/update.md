# Test: Update Label

## Setup

```bash
export TODUAI_DATA_DIR=$(mktemp -d)
export NODE_PATH=$(find ~/.npm/_npx -path "*/node_modules/playwright" -type d 2>/dev/null | head -1 | xargs dirname)
export INTERACT=~/.pi/agent/skills/electron-testing/scripts/interact.js

~/.pi/agent/skills/electron-testing/scripts/launch.sh \
  --app-path ./packages/electron/dist/main/index.js \
  --env "TODUAI_DATA_DIR=$TODUAI_DATA_DIR"

toduai label create --name bug --color "#ff0000"
```

## 1. Update Name (CLI)

```bash
toduai label update bug --name defect
```

**Expected:**

```
Label updated:
ID:      lbl-XXXXXXXX
Name:    defect
Color:   #ff0000
Created: YYYY-MM-DDTHH:MM:SS.MMMZ
```

## 2. Update Color (CLI)

```bash
toduai label update defect --color "#cc0000"
```

**Expected:** Color changed to `#cc0000`.

## 3. Update Both (CLI)

```bash
toduai label update defect --name critical --color "#990000"
```

**Expected:** Both name and color updated.

## 4. Update by ID (CLI)

```bash
LABEL_ID=$(toduai --format json label list | jq -r '.[0].id')
toduai label update "$LABEL_ID" --name urgent
```

**Expected:** Name changed to "urgent".

## 5. Verify Final State (CLI)

```bash
toduai label list --no-color
```

**Expected:** Shows "urgent" with color `#990000`.

## 6. Verify Electron Reflects CLI Updates

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Labels"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** Table shows "urgent" with the dark red color dot.

```bash
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-label-update-cli.png
```

## 7. Edit Label in Electron

Click the Edit button for the label to open the edit dialog.

```bash
NODE_PATH=$NODE_PATH node $INTERACT click ".cell-actions .btn-secondary"
NODE_PATH=$NODE_PATH node $INTERACT wait ".dialog" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-label-edit-dialog.png
```

**Expected:** "Edit Label" dialog with Name pre-filled as "urgent" and color `#990000`.

```bash
# Clear name and type new one
NODE_PATH=$NODE_PATH node $INTERACT click "#label-name"
NODE_PATH=$NODE_PATH node $INTERACT press "Control+a"
NODE_PATH=$NODE_PATH node $INTERACT type "renamed-in-electron"
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('#label-name').value"
```

**Expected:** Returns `"renamed-in-electron"`.

> **Note:** The name input has `ref={(el) => el?.focus()}` (bug #1762). Since this is a
> single-field form (name only — color uses swatches), focus-stealing shouldn't affect typing.

```bash
# Pick a new preset color (green swatch, index 3)
NODE_PATH=$NODE_PATH node $INTERACT click ".color-swatch >> nth=3"
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-label-edit-color.png
```

**Expected:** Green swatch selected.

```bash
NODE_PATH=$NODE_PATH node $INTERACT click ".dialog-actions .btn-primary"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** Dialog closes. Table shows "renamed-in-electron" with green color.

## 8. Verify CLI Sees Electron Changes

```bash
toduai label list --no-color
```

**Expected:** Shows "renamed-in-electron" with green color (#22c55e).

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODUAI_DATA_DIR"
```
