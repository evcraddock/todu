# Test: Update Project

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
todu-new project create --name "My App" --priority medium
```

## Update Name

```bash
todu-new project update "My App" --name "My Application"
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
todu-new project update "My Application" --priority high
```

**Expected:** Shows priority changed to `high`.

## Update Status

```bash
todu-new project update "My Application" --status done
```

**Expected:** Shows status changed to `done`.

## Update Multiple Fields

```bash
todu-new project update "My Application" --name "Legacy App" --priority low
```

**Expected:** Both name and priority updated.

## Verify

```bash
todu-new project show "Legacy App"
```

**Expected:** Shows name=Legacy App, status=done, priority=low.

## Cleanup

```bash
rm -rf "$TODU_DATA_DIR"
```
