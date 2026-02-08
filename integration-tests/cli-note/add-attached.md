# Test: Add Attached Notes

Notes attached to tasks or projects.

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
toduai project create --name "My App"
TASK=$(toduai --format json task create --title "Fix bug" --project "My App")
TASK_ID=$(echo "$TASK" | jq -r .id)
```

## Note Attached to Task

```bash
toduai note add "Found the root cause — null pointer in auth module" --task "$TASK_ID"
```

**Expected:**

```
Note added:
ID:      note-XXXXXXXX
Author:  user
Created: YYYY-MM-DDTHH:MM:SS.MMMZ
Entity:  task:task-XXXXXXXX

Found the root cause — null pointer in auth module
```

## Note Attached to Project (by Name)

```bash
toduai note add "Architecture decision: use Automerge for sync" --project "My App"
```

**Expected:**

```
Note added:
ID:      note-XXXXXXXX
Author:  user
Created: YYYY-MM-DDTHH:MM:SS.MMMZ
Entity:  project:proj-XXXXXXXX

Architecture decision: use Automerge for sync
```

## Attached Note with Tags

```bash
toduai note add "Blocked on API key" --task "$TASK_ID" --tag blocker
```

**Expected:** Shows entity and tags.

## Verify Task Notes

```bash
toduai note list --task "$TASK_ID" --no-color
```

**Expected:** Shows 2 notes attached to the task.

## Verify Project Notes

```bash
toduai note list --project "My App" --no-color
```

**Expected:** Shows 1 note attached to the project.

## Cleanup

```bash
rm -rf "$TODU_DATA_DIR"
```
