# Test: Add Journal Entry (Standalone Note)

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
export NODE_PATH=$(find ~/.npm/_npx -path "*/node_modules/playwright" -type d 2>/dev/null | head -1 | xargs dirname)
export INTERACT=~/.pi/agent/skills/electron-testing/scripts/interact.js

~/.pi/agent/skills/electron-testing/scripts/launch.sh \
  --app-path ./packages/electron/dist/main/index.js \
  --env "TODU_DATA_DIR=$TODU_DATA_DIR"
```

## 1. Simple Journal Entry (CLI)

```bash
toduai note add "Today I shipped the login feature"
```

**Expected:**

```
Note added:
ID:      note-XXXXXXXX
Author:  user
Created: YYYY-MM-DDTHH:MM:SS.MMMZ

Today I shipped the login feature
```

## 2. Journal Entry with Tags (CLI)

```bash
toduai note add "Sprint retrospective went well" --tag retro --tag weekly
```

**Expected:**

```
Note added:
ID:      note-XXXXXXXX
Author:  user
Created: YYYY-MM-DDTHH:MM:SS.MMMZ
Tags:    retro, weekly

Sprint retrospective went well
```

## 3. Journal Entry with Author (CLI)

```bash
toduai note add "Reviewed the PR" --author "agent"
```

**Expected:**

```
Note added:
ID:      note-XXXXXXXX
Author:  agent
Created: YYYY-MM-DDTHH:MM:SS.MMMZ

Reviewed the PR
```

## 4. Journal Entry with JSON Output (CLI)

```bash
toduai --format json note add "Quick thought"
```

**Expected:** JSON object with id, content, author, tags, createdAt.

## 5. Verify CLI List

```bash
toduai note list --no-color
```

**Expected:** All 4 notes listed.

## 6. Verify Electron Shows CLI-Created Notes

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Notes"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** Table shows all 4 notes with columns: Date, Author, Content, Attached To, Tags, Actions.
- "Today I shipped..." with Author=user, Attached To=Standalone
- "Sprint retrospective..." with Tags: retro, weekly
- "Reviewed the PR" with Author=agent
- "Quick thought" with Author=user

```bash
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-note-journal-list.png
```

## 7. Create Journal Note in Electron

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=+ New Note"
NODE_PATH=$NODE_PATH node $INTERACT wait ".dialog" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-note-create-dialog.png
```

**Expected:** "New Journal Note" dialog with Content textarea and Tags input.

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "#note-content"
NODE_PATH=$NODE_PATH node $INTERACT type "Created from Electron UI"
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('#note-content').value"
```

**Expected:** Returns `"Created from Electron UI"`.

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "#note-tags"
NODE_PATH=$NODE_PATH node $INTERACT type "electron, test"
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('#note-tags').value"
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('#note-content').value"
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-note-create-typed.png
```

**Expected:**
- Tags returns `"electron, test"`
- Content still returns `"Created from Electron UI"` (unchanged)
- If content got corrupted, confirms focus-stealing bug (#1762)

```bash
NODE_PATH=$NODE_PATH node $INTERACT click ".dialog-actions .btn-primary"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** Dialog closes. Table now shows 5 notes including "Created from Electron UI" with tags: electron, test.

## 8. Verify CLI Sees Electron-Created Note

```bash
toduai note list --no-color
```

**Expected:** Five notes shown, including "Created from Electron UI".

```bash
toduai note list --tag electron --no-color
```

**Expected:** Only "Created from Electron UI".

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODU_DATA_DIR"
```
