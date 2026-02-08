# Test: Project Error Cases

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
```

## Show Nonexistent Project

```bash
toduai project show "Nonexistent"
```

**Expected:**

```
Project not found: Nonexistent
```

Exit code: 1

## Update Nonexistent Project

```bash
toduai project update "Nonexistent" --name "Foo"
```

**Expected:**

```
Project not found: Nonexistent
```

## Delete Nonexistent Project

```bash
toduai project delete "Nonexistent"
```

**Expected:**

```
Project not found: Nonexistent
```

## Create Without Name

```bash
toduai project create
```

**Expected:** Error about missing required `--name` option.

## Cleanup

```bash
rm -rf "$TODU_DATA_DIR"
```
