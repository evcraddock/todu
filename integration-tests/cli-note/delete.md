# Test: Delete Note

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
NOTE=$(todu-new --format json note add "Delete me")
NOTE_ID=$(echo "$NOTE" | jq -r .id)
```

## Delete Note

```bash
todu-new note delete "$NOTE_ID"
```

**Expected:**

```
Deleted note: note-XXXXXXXX
```

## Verify Deleted

```bash
todu-new note list --no-color
```

**Expected:**

```
No results.
```

## Delete Nonexistent Note

```bash
todu-new note delete "note-nonexistent"
```

**Expected:**

```
Error: note not found: note-nonexistent
```

## Cleanup

```bash
rm -rf "$TODU_DATA_DIR"
```
