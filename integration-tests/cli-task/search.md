# Test: Search Tasks

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
toduai project create --name "App"
toduai task create --title "Fix login bug" --project "App"
toduai task create --title "Add search feature" --project "App"
toduai task create --title "Update README" --project "App"
```

## Search by Keyword

```bash
toduai task search "login" --no-color
```

**Expected:**

```
ID             Title          Status  Priority  Project
───────────────────────────────────────────────────────
task-XXXXXXXX  Fix login bug  active  medium    App    
```

## Case-Insensitive Search

```bash
toduai task search "LOGIN" --no-color
```

**Expected:** Same result — finds "Fix login bug".

## Search with Multiple Matches

```bash
toduai task search "e" --no-color
```

**Expected:** Multiple tasks matching (any task with "e" in the title).

## Search with No Results

```bash
toduai task search "nonexistent" --no-color
```

**Expected:**

```
No results.
```

## Search as JSON

```bash
toduai --format json task search "login"
```

**Expected:** JSON array with matching tasks.

## Cleanup

```bash
rm -rf "$TODU_DATA_DIR"
```
