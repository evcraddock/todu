# Test: Add Journal Entry (Standalone Note)

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
```

## Simple Journal Entry

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

## Journal Entry with Tags

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

## Journal Entry with Author

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

## Journal Entry with JSON Output

```bash
toduai --format json note add "Quick thought"
```

**Expected:**

```json
{
  "id": "note-XXXXXXXX",
  "content": "Quick thought",
  "author": "user",
  "tags": [],
  "createdAt": "YYYY-MM-DDTHH:MM:SS.MMMZ"
}
```

## Verify

```bash
toduai note list --no-color
```

**Expected:** All 4 notes listed.

## Cleanup

```bash
rm -rf "$TODU_DATA_DIR"
```
