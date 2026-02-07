# Test: Search Tasks

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
todu-new project create --name "App"
todu-new task create --title "Fix login bug" --project "App"
todu-new task create --title "Add search feature" --project "App"
todu-new task create --title "Update README" --project "App"
```

## Search by Keyword

```bash
todu-new task search "login" --no-color
```

**Expected:**

```
ID             Title          Status  Priority  Project
───────────────────────────────────────────────────────
task-XXXXXXXX  Fix login bug  active  medium    App    
```

## Case-Insensitive Search

```bash
todu-new task search "LOGIN" --no-color
```

**Expected:** Same result — finds "Fix login bug".

## Search with Multiple Matches

```bash
todu-new task search "e" --no-color
```

**Expected:** Multiple tasks matching (any task with "e" in the title).

## Search with No Results

```bash
todu-new task search "nonexistent" --no-color
```

**Expected:**

```
No results.
```

## Search as JSON

```bash
todu-new --format json task search "login"
```

**Expected:** JSON array with matching tasks.

## Cleanup

```bash
rm -rf "$TODU_DATA_DIR"
```
