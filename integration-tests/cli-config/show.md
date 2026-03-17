# Test: Config Show

## 1. Default Config — No File

```bash
todu config show
```

**Expected:**

```
Config file:  /home/<user>/.config/todu/config.yaml
              (default, not found)
Data dir:     /home/<user>/.config/todu/data
              (default)
```

## 2. With --config Flag

```bash
WORK_DIR=$(mktemp -d)
cd "$WORK_DIR"
todu config init
todu --config .todu/config.yaml config show
```

**Expected:**

```
Config file:  /path/to/.todu/config.yaml
              (--config flag)
Data dir:     /path/to/.todu/data
              (config file (/path/to/.todu/config.yaml))
```

## 3. With TODU_DATA_DIR Override

```bash
TODU_DATA_DIR=/tmp/override-data todu config show
```

**Expected:**

```
Config file:  /home/<user>/.config/todu/config.yaml
              (default, not found)
Data dir:     /tmp/override-data
              (TODU_DATA_DIR env var)
```

## 4. JSON Output

```bash
todu --format json config show
```

**Expected:** JSON object with configPath, configSource, configExists, dataDir, dataDirSource fields.

## Teardown

```bash
cd -
rm -rf "$WORK_DIR"
```
