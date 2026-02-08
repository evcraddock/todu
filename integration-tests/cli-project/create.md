# Test: Create Project

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
```

## Create with Name Only

```bash
toduai project create --name "My App"
```

**Expected:**

```
Project created:
ID:          proj-XXXXXXXX
Name:        My App
Status:      active
Priority:    medium
Sync:        none
Created:     YYYY-MM-DDTHH:MM:SS.MMMZ
Updated:     YYYY-MM-DDTHH:MM:SS.MMMZ
```

Defaults: status=active, priority=medium, sync=none.

## Create with All Options

```bash
toduai project create --name "Backend API" --priority high --description "REST API service"
```

**Expected:**

```
Project created:
ID:          proj-XXXXXXXX
Name:        Backend API
Status:      active
Priority:    high
Sync:        none
Created:     YYYY-MM-DDTHH:MM:SS.MMMZ
Updated:     YYYY-MM-DDTHH:MM:SS.MMMZ
Description: REST API service
```

## Create with JSON Output

```bash
toduai --format json project create --name "Frontend"
```

**Expected:** JSON object with id, name, status, priority, syncStrategy, createdAt, updatedAt fields.

```json
{
  "id": "proj-XXXXXXXX",
  "name": "Frontend",
  "status": "active",
  "priority": "medium",
  "syncStrategy": "none",
  "createdAt": "YYYY-MM-DDTHH:MM:SS.MMMZ",
  "updatedAt": "YYYY-MM-DDTHH:MM:SS.MMMZ"
}
```

## Verify

```bash
toduai project list
```

**Expected:** All three projects shown in table format.

## Cleanup

```bash
rm -rf "$TODU_DATA_DIR"
```
