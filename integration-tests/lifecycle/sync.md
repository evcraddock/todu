# Test: CLI↔Electron Sync

Verify the sync server enables real-time data sharing between CLI and Electron.

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
```

**Note:** Data sync can trigger re-renders that cause bug #1762 (focus-stealing)
to open unwanted dialogs. Before each navigation step, dismiss any stuck dialog overlays
by clicking the Cancel button (which properly updates React state):

```bash
NODE_PATH=$NODE_PATH node $INTERACT eval "(() => { const btn = document.querySelector('.dialog-actions .btn-secondary'); if (btn) { btn.click(); return 'dismissed'; } return 'none'; })()"
```

If Cancel button isn't available, force-remove the overlay:

```bash
NODE_PATH=$NODE_PATH node $INTERACT eval "(() => { const btn = document.querySelector('.dialog-actions .btn-secondary'); if (btn) { btn.click(); return 'dismissed'; } const o = document.querySelector('.dialog-overlay'); if (o) { o.remove(); return 'force-removed'; } return 'none'; })()"
```

## 1. CLI Create → Electron Sees Immediately

Create data via CLI and verify Electron picks it up without restart.

```bash
toduai project create --name "Sync Test"
NODE_PATH=$NODE_PATH node $INTERACT click "text=Projects"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** "Sync Test" appears in Electron project list.

## 2. Electron Create → CLI Sees Immediately

Create a label via Electron (single-field dialog, no focus-stealing issue).

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Labels"
NODE_PATH=$NODE_PATH node $INTERACT wait ".content-area" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT click "text=+ New Label"
NODE_PATH=$NODE_PATH node $INTERACT wait ".dialog" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT click "#label-name"
NODE_PATH=$NODE_PATH node $INTERACT type "from-electron"
NODE_PATH=$NODE_PATH node $INTERACT click ".dialog-actions .btn-primary"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000

toduai label list --no-color
```

**Expected:** "from-electron" appears in CLI label list.

## 3. Rapid CLI Changes Reflected in Electron

Create multiple items quickly via CLI and verify Electron shows all.

```bash
toduai task create --title "Task 1" --project "Sync Test"
toduai task create --title "Task 2" --project "Sync Test"
toduai task create --title "Task 3" --project "Sync Test"
toduai label create --name urgent --color "#ef4444"
toduai note add "Sync test note" --tag sync

NODE_PATH=$NODE_PATH node $INTERACT eval "(() => { const btn = document.querySelector('.dialog-actions .btn-secondary'); if (btn) { btn.click(); return 'dismissed'; } const o = document.querySelector('.dialog-overlay'); if (o) { o.remove(); return 'force-removed'; } return 'none'; })()"
NODE_PATH=$NODE_PATH node $INTERACT click "text=Tasks"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** All 3 tasks visible.

```bash
NODE_PATH=$NODE_PATH node $INTERACT eval "(() => { const btn = document.querySelector('.dialog-actions .btn-secondary'); if (btn) { btn.click(); return 'dismissed'; } const o = document.querySelector('.dialog-overlay'); if (o) { o.remove(); return 'force-removed'; } return 'none'; })()"
NODE_PATH=$NODE_PATH node $INTERACT click "text=Labels"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** "urgent" label visible.

```bash
NODE_PATH=$NODE_PATH node $INTERACT eval "(() => { const btn = document.querySelector('.dialog-actions .btn-secondary'); if (btn) { btn.click(); return 'dismissed'; } const o = document.querySelector('.dialog-overlay'); if (o) { o.remove(); return 'force-removed'; } return 'none'; })()"
NODE_PATH=$NODE_PATH node $INTERACT click "text=Notes"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** "Sync test note" visible.

## 4. CLI Update → Electron Sees Change

```bash
TASK_ID=$(toduai --format json task list | jq -r '.[0].id')
toduai task update "$TASK_ID" --title "Updated via CLI" --priority high

NODE_PATH=$NODE_PATH node $INTERACT eval "(() => { const btn = document.querySelector('.dialog-actions .btn-secondary'); if (btn) { btn.click(); return 'dismissed'; } const o = document.querySelector('.dialog-overlay'); if (o) { o.remove(); return 'force-removed'; } return 'none'; })()"
NODE_PATH=$NODE_PATH node $INTERACT click "text=Tasks"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** "Updated via CLI" appears with priority=high in the Electron table.

## 5. CLI Delete → Electron Sees Removal

Navigate away and back to ensure view refreshes after delete.

```bash
toduai task delete "$TASK_ID"

NODE_PATH=$NODE_PATH node $INTERACT eval "(() => { const btn = document.querySelector('.dialog-actions .btn-secondary'); if (btn) { btn.click(); return 'dismissed'; } const o = document.querySelector('.dialog-overlay'); if (o) { o.remove(); return 'force-removed'; } return 'none'; })()"
NODE_PATH=$NODE_PATH node $INTERACT click "text=Projects"
NODE_PATH=$NODE_PATH node $INTERACT wait ".content-area" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT eval "(() => { const btn = document.querySelector('.dialog-actions .btn-secondary'); if (btn) { btn.click(); return 'dismissed'; } const o = document.querySelector('.dialog-overlay'); if (o) { o.remove(); return 'force-removed'; } return 'none'; })()"
NODE_PATH=$NODE_PATH node $INTERACT click "text=Tasks"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** "Updated via CLI" no longer in the table.

## 6. All Domains Sync

Verify sync works across all entity types, not just tasks.

```bash
toduai habit create --title "Sync habit" --schedule "FREQ=DAILY" --timezone "$TZ" --start-date "$TODAY"
toduai recurring create --title "Sync recurring" --schedule "FREQ=DAILY" --project "Sync Test" --timezone "$TZ" --start-date "$TODAY"

NODE_PATH=$NODE_PATH node $INTERACT eval "(() => { const btn = document.querySelector('.dialog-actions .btn-secondary'); if (btn) { btn.click(); return 'dismissed'; } const o = document.querySelector('.dialog-overlay'); if (o) { o.remove(); return 'force-removed'; } return 'none'; })()"
NODE_PATH=$NODE_PATH node $INTERACT click "text=Habits"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** "Sync habit" visible.

```bash
NODE_PATH=$NODE_PATH node $INTERACT eval "(() => { const btn = document.querySelector('.dialog-actions .btn-secondary'); if (btn) { btn.click(); return 'dismissed'; } const o = document.querySelector('.dialog-overlay'); if (o) { o.remove(); return 'force-removed'; } return 'none'; })()"
NODE_PATH=$NODE_PATH node $INTERACT click "text=Recurring"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** "Sync recurring" visible.

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODUAI_DATA_DIR"
```
