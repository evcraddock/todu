# Test: Note Error Cases

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
```

## Add Note to Nonexistent Task

```bash
todu-new note add "Orphan note" --task "task-nonexistent"
```

**Expected:**

```
Error: task not found: task-nonexistent
```

Exit code: 1

## Add Note to Nonexistent Project

```bash
todu-new note add "Orphan note" --project "Nonexistent"
```

**Expected:**

```
Project not found: Nonexistent
```

## List Notes for Nonexistent Project

```bash
todu-new note list --project "Nonexistent"
```

**Expected:**

```
Project not found: Nonexistent
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
