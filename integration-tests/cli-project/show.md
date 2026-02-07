# Test: Show Project

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
todu-new project create --name "My App" --priority high --description "Main application"
```

## Show by Name

```bash
todu-new project show "My App"
```

**Expected:**

```
ID:          proj-XXXXXXXX
Name:        My App
Status:      active
Priority:    high
Sync:        none
Created:     YYYY-MM-DDTHH:MM:SS.MMMZ
Updated:     YYYY-MM-DDTHH:MM:SS.MMMZ
Description: Main application
```

## Show by ID

```bash
# Get the ID first
PROJECT_ID=$(todu-new --format json project list | jq -r '.[0].id')
todu-new project show "$PROJECT_ID"
```

**Expected:** Same output as above.

## Show as JSON

```bash
todu-new --format json project show "My App"
```

**Expected:** JSON object with all project fields.

## Cleanup

```bash
rm -rf "$TODU_DATA_DIR"
```
