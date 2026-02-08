# Test: Create Task

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
toduai project create --name "My App"
```

## Create with Required Fields

```bash
toduai task create --title "Fix login bug" --project "My App"
```

**Expected:**

```
Task created:
ID:          task-XXXXXXXX
Title:       Fix login bug
Status:      active
Priority:    medium
Project:     My App
Labels:      (none)
Created:     YYYY-MM-DDTHH:MM:SS.MMMZ
Updated:     YYYY-MM-DDTHH:MM:SS.MMMZ
```

Defaults: status=active, priority=medium.

## Create with All Options

```bash
toduai label create --name bug --color "#ff0000"
toduai task create --title "Fix crash" --project "My App" --priority high \
  --description "App crashes on startup" --label bug --due "2026-03-01" --scheduled "2026-02-15"
```

**Expected:**

```
Task created:
ID:          task-XXXXXXXX
Title:       Fix crash
Status:      active
Priority:    high
Project:     My App
Labels:      bug
Created:     YYYY-MM-DDTHH:MM:SS.MMMZ
Updated:     YYYY-MM-DDTHH:MM:SS.MMMZ
Due:         2026-03-01
Scheduled:   2026-02-15

Description:
App crashes on startup
```

## Create with JSON Output

```bash
toduai --format json task create --title "Add tests" --project "My App" --priority low
```

**Expected:**

```json
{
  "id": "task-XXXXXXXX",
  "title": "Add tests",
  "status": "active",
  "priority": "low",
  "projectId": "proj-XXXXXXXX",
  "labels": [],
  "createdAt": "YYYY-MM-DDTHH:MM:SS.MMMZ",
  "updatedAt": "YYYY-MM-DDTHH:MM:SS.MMMZ"
}
```

## Verify

```bash
toduai task list --no-color
```

**Expected:** All three tasks shown in table format.

## Cleanup

```bash
rm -rf "$TODU_DATA_DIR"
```
