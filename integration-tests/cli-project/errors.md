# Test: Project Error Cases

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
```

## Show Nonexistent Project

```bash
todu-new project show "Nonexistent"
```

**Expected:**

```
Project not found: Nonexistent
```

Exit code: 1

## Update Nonexistent Project

```bash
todu-new project update "Nonexistent" --name "Foo"
```

**Expected:**

```
Project not found: Nonexistent
```

## Delete Nonexistent Project

```bash
todu-new project delete "Nonexistent"
```

**Expected:**

```
Project not found: Nonexistent
```

## Create Without Name

```bash
todu-new project create
```

**Expected:** Error about missing required `--name` option.

## Cleanup

```bash
rm -rf "$TODU_DATA_DIR"
```
