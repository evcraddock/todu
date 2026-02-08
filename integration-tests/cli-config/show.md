# Test: Config Show

## Default Config (No File)

```bash
todu-new config show
```

**Expected:**

```
Config file:  /home/<user>/.config/todu/config.yaml
              (default, not found)
Data dir:     /home/<user>/.config/todu/data
              (default)
```

## With --config Flag

```bash
cd $(mktemp -d)
todu-new config init
todu-new --config .todu/config.yaml config show
```

**Expected:**

```
Config file:  /path/to/.todu/config.yaml
              (--config flag)
Data dir:     /path/to/.todu/data
              (config file (/path/to/.todu/config.yaml))
```

## With TODU_DATA_DIR Override

```bash
export TODU_DATA_DIR=/tmp/override-data
todu-new config show
```

**Expected:**

```
Config file:  /home/<user>/.config/todu/config.yaml
              (default, not found)
Data dir:     /tmp/override-data
              (TODU_DATA_DIR env var)
```

```bash
unset TODU_DATA_DIR
```

## JSON Output

```bash
todu-new --format json config show
```

**Expected:** JSON object with configPath, configSource, configExists, dataDir, dataDirSource fields.

## Cleanup

```bash
cd - && rm -rf /tmp/tmp.*
```
