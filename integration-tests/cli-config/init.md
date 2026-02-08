# Test: Config Init

## Setup

```bash
cd $(mktemp -d)
```

## Initialize Dev Config

```bash
todu-new config init
```

**Expected:**

```
Created: /path/to/.todu/config.yaml
Created: /path/to/.todu/.gitignore

Usage:
  todu-new --config /path/to/.todu/config.yaml task list
```

## Verify Files Created

```bash
cat .todu/config.yaml
```

**Expected:**

```yaml
data_dir: ./data
```

```bash
cat .todu/.gitignore
```

**Expected:**

```
# Ignore todu data
data/
```

## Init is Idempotent

```bash
todu-new config init
```

**Expected:**

```
Config already exists: /path/to/.todu/config.yaml
```

## Cleanup

```bash
cd - && rm -rf /tmp/tmp.*
```
