# Test: Update Project

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
toduai project create --name "My App" --priority medium
```

## Update Name

```bash
toduai project update "My App" --name "My Application"
```

**Expected:**

```
Project updated:
ID:          proj-XXXXXXXX
Name:        My Application
Status:      active
Priority:    medium
Sync:        none
Created:     YYYY-MM-DDTHH:MM:SS.MMMZ
Updated:     YYYY-MM-DDTHH:MM:SS.MMMZ
```

## Update Priority

```bash
toduai project update "My Application" --priority high
```

**Expected:** Shows priority changed to `high`.

## Update Status

```bash
toduai project update "My Application" --status done
```

**Expected:** Shows status changed to `done`.

## Update Multiple Fields

```bash
toduai project update "My Application" --name "Legacy App" --priority low
```

**Expected:** Both name and priority updated.

## Verify

```bash
toduai project show "Legacy App"
```

**Expected:** Shows name=Legacy App, status=done, priority=low.

## Cleanup

```bash
rm -rf "$TODU_DATA_DIR"
```
