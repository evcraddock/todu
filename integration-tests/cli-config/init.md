# Test: Config Init

## Setup

```bash
WORK_DIR=$(mktemp -d)
cd "$WORK_DIR"
```

## 1. Initialize Dev Config

```bash
toduai config init
```

**Expected:**

```
Created: /path/to/.toduai/config.yaml
Created: /path/to/.toduai/.gitignore

Usage:
  toduai --config /path/to/.toduai/config.yaml task list
```

## 2. Verify Files Created

```bash
cat .toduai/config.yaml
```

**Expected:**

```yaml
data_dir: ./data
```

```bash
cat .toduai/.gitignore
```

**Expected:**

```
# Ignore toduai data
data/
```

## 3. Init is Idempotent

```bash
toduai config init
```

**Expected:**

```
Config already exists: /path/to/.toduai/config.yaml
```

Exit code: 0 (not an error).

## Teardown

```bash
cd -
rm -rf "$WORK_DIR"
```
