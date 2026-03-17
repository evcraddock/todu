# Test: Create Label

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
export NODE_PATH=$(find ~/.npm/_npx -path "*/node_modules/playwright" -type d 2>/dev/null | head -1 | xargs dirname)
export INTERACT=~/.pi/agent/skills/electron-testing/scripts/interact.js

~/.pi/agent/skills/electron-testing/scripts/launch.sh \
  --app-path ./packages/electron/dist/main/index.js \
  --env "TODU_DATA_DIR=$TODU_DATA_DIR"
```

## 1. Create with Name Only (CLI)

```bash
todu label create --name bug
```

**Expected:**

```
Label created:
ID:      lbl-XXXXXXXX
Name:    bug
Created: YYYY-MM-DDTHH:MM:SS.MMMZ
```

## 2. Create with Color (CLI)

```bash
todu label create --name urgent --color "#ff0000"
```

**Expected:**

```
Label created:
ID:      lbl-XXXXXXXX
Name:    urgent
Color:   #ff0000
Created: YYYY-MM-DDTHH:MM:SS.MMMZ
```

## 3. Create with JSON Output (CLI)

```bash
todu --format json label create --name feature --color "#00ff00"
```

**Expected:** JSON object with id, name, color, createdAt.

## 4. Verify CLI List

```bash
todu label list --no-color
```

**Expected:** All three labels shown (bug, urgent, feature).

## 5. Verify Electron Shows CLI-Created Labels

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Labels"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** Table shows all three labels with columns: Color, Name, Tasks, Actions.
- "bug" with no color dot
- "urgent" with red color dot
- "feature" with green color dot

```bash
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-label-create-list.png
```

## 6. Create Label in Electron

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=+ New Label"
NODE_PATH=$NODE_PATH node $INTERACT wait ".dialog" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-label-create-dialog.png
```

**Expected:** "New Label" dialog with Name field and ColorPicker (preset swatches + hex input).

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "#label-name"
NODE_PATH=$NODE_PATH node $INTERACT type "docs"
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('#label-name').value"
```

**Expected:** Returns `"docs"`.

```bash
# Pick a preset color (blue swatch)
NODE_PATH=$NODE_PATH node $INTERACT click ".color-swatch >> nth=5"
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-label-create-color.png
```

**Expected:** Blue swatch selected, preview shown.

```bash
NODE_PATH=$NODE_PATH node $INTERACT click ".dialog-actions .btn-primary"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** Dialog closes. Table now shows 4 labels including "docs" with blue color.

## 7. Verify CLI Sees Electron-Created Label

```bash
todu label list --no-color
```

**Expected:** Four labels shown, including "docs".

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODU_DATA_DIR"
```
