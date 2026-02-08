# Test: Show Task

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
toduai project create --name "My App"
TASK=$(toduai --format json task create --title "Fix login" --project "My App" --priority high --description "Users can't log in with SSO")
TASK_ID=$(echo "$TASK" | jq -r .id)
```

## Show Task

```bash
toduai task show "$TASK_ID"
```

**Expected:**

```
ID:          task-XXXXXXXX
Title:       Fix login
Status:      active
Priority:    high
Project:     My App
Labels:      (none)
Created:     YYYY-MM-DDTHH:MM:SS.MMMZ
Updated:     YYYY-MM-DDTHH:MM:SS.MMMZ

Description:
Users can't log in with SSO
```

## Show as JSON

```bash
toduai --format json task show "$TASK_ID"
```

**Expected:** JSON object including `description` field.

```json
{
  "id": "task-XXXXXXXX",
  "title": "Fix login",
  "status": "active",
  "priority": "high",
  "projectId": "proj-XXXXXXXX",
  "labels": [],
  "description": "Users can't log in with SSO",
  "createdAt": "YYYY-MM-DDTHH:MM:SS.MMMZ",
  "updatedAt": "YYYY-MM-DDTHH:MM:SS.MMMZ"
}
```

## Cleanup

```bash
rm -rf "$TODU_DATA_DIR"
```
