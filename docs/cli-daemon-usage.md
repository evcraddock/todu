# CLI Daemon Usage Notes

`toduai` now runs in daemon-first mode for task/project/label/note/recurring/habit/sync command groups.

The legacy `toduai serve` path has been removed.

For always-on daemon startup (recommended), use OS service manager setup from [`daemon-service-operations.md`](daemon-service-operations.md).

## Start/stop/restart the local daemon

Recommended for persistent operation:

- Use OS service manager setup in [`daemon-service-operations.md`](daemon-service-operations.md)
- Then control lifecycle through your service manager (`systemctl --user` / `launchctl`)

CLI wrappers are available:

```bash
toduai daemon start
toduai daemon stop
toduai daemon restart
```

Wrapper behavior:

- **Delegates** to system service managers when configured (`systemd --user` on Linux, `launchd` on macOS).
- Falls back to **direct managed mode** when no service registration exists.
- Direct mode tracks a managed PID at `<data_dir>/daemon.pid` and refuses to stop unmanaged daemon processes.
- Direct mode appends stdout/stderr logs to `<data_dir>/daemon.out.log` and `<data_dir>/daemon.err.log`.
- On `daemon start`/`daemon restart`, oversized direct log files are rotated to `.1` and `.2` before the new process starts.

Foreground daemon run (manual/interactive) is still available:

```bash
toduai daemon run
```

You can also run the daemon binary directly:

```bash
toduai-daemon
```

For local development from source:

```bash
npm run --workspace=packages/daemon dev
```

## Daemon log levels

Set daemon log level via `TODUAI_LOG_LEVEL`:

- `error`
- `warn`
- `info` (default)
- `debug`

Examples:

```bash
TODUAI_LOG_LEVEL=debug make dev
TODUAI_LOG_LEVEL=warn toduai daemon run
```

`debug` adds RPC operation context (method, request id, param keys, outcome, duration) to help trace CRUD flows.

## How CLI finds the daemon socket

By default, CLI connects to:

- `<data_dir>/daemon.sock`

Override with:

- `TODUAI_DAEMON_SOCKET=/path/to/daemon.sock`

## Worker assignment configuration

Configure assigned worker types in config file:

```yaml
daemon:
  workers:
    assigned:
      - recurring
      - github-sync
```

Override with env var (comma-separated):

```bash
export TODUAI_DAEMON_ASSIGNED_WORKERS="recurring,github-sync"
```

Notes:
- Env var overrides config file assignment.
- Empty assignment (`TODUAI_DAEMON_ASSIGNED_WORKERS=""`) means no local workers are assigned.
- Duplicate entries are tolerated and logged; first occurrence wins.

## Sync plugin module configuration

Configure sync plugin module entrypoints in config file:

```yaml
daemon:
  plugins:
    paths:
      - ./plugins/github-plugin/dist/index.js
      - ./plugins/forgejo-plugin/dist/index.js
```

Override with env var (comma-separated module paths):

```bash
export TODUAI_DAEMON_PLUGIN_PATHS="/opt/todu/plugins/github/index.js,/opt/todu/plugins/forgejo/index.js"
```

Notes:
- Env var overrides config file plugin paths.
- Config file plugin paths are resolved relative to the config file directory.
- Empty plugin path list (`TODUAI_DAEMON_PLUGIN_PATHS=""`) disables plugin loading.
- Duplicate entries are tolerated and logged; first occurrence wins.
- Changes require daemon restart to apply.

## Plugin management commands

Use CLI plugin commands to manage configured sync plugin modules:

```bash
toduai plugin install <module-path-or-package>
toduai plugin list
toduai plugin remove <plugin-name-or-module-path>
toduai plugin config <plugin-name-or-module-path>
toduai plugin config <plugin-name-or-module-path> --set '{"key":"value"}'
toduai plugin config <plugin-name-or-module-path> --clear
```

Behavior notes:
- `plugin install` validates plugin exports before saving config.
- Supported plugin exports are `workerPlugin` (generic worker plugin) and `syncProvider` (sync provider plugin).
- `plugin list` shows configured plugins, plugin kind, and daemon runtime worker state when daemon is available.
- `plugin remove` and `plugin install` report when daemon restart is required for activation/removal.
- `plugin config --set` requires a JSON object.

Recurring worker standalone plugin example (no daemon/core dependency wiring required):

```bash
toduai plugin install ./packages/recurring-worker/dist/index.js
toduai plugin config recurring-worker --set '{"intervalSeconds":30}'
```

Per-plugin sync scheduler fields are configured through `plugin config --set`:

```bash
toduai plugin config github --set '{"intervalSeconds":300,"retryInitialSeconds":5,"retryMaxSeconds":60,"settings":{"token":"env:GITHUB_TOKEN"}}'
```

Supported scheduler fields:
- `intervalSeconds` (positive number): steady-state cycle interval.
- `retryInitialSeconds` (positive number): first retry delay after a failed cycle.
- `retryMaxSeconds` (positive number): upper bound for exponential backoff.
- `enabled` (boolean, optional): disables the local provider worker when false.
- `settings` (object, optional): provider-specific settings passed to `initialize(...)`.

Integration binding desired state is not configured through local plugin config. The local plugin config only controls host-local execution settings and credentials.

Retry policy:
- Failures are logged with plugin name, attempt count, and next retry delay.
- Backoff uses `retryInitialSeconds * 2^attempt`, capped at `retryMaxSeconds`.
- A successful cycle resets retry attempt state.
- Changes require daemon restart to apply.

## Integration management commands

Use the generic integration command group to manage integration bindings through the local daemon:

```bash
toduai integration list
toduai integration list --provider github
toduai integration add --provider github --project Work --target-kind repository --target owner/repo
toduai integration update <binding-id> --target-kind repository --target owner/renamed-repo
toduai integration set-strategy <binding-id> --strategy pull
toduai integration enable <binding-id>
toduai integration disable <binding-id>
toduai integration remove <binding-id>
toduai integration status
toduai integration status <binding-id>
```

Behavior notes:
- Integration bindings are the generic shared control plane for external integrations.
- Project commands no longer expose project-level external sync settings; use `toduai integration ...` to manage external sync intent.
- Provider-specific credential setup stays out of `integration add|update|remove` and remains local to the authority daemon host.
- `integration list` supports filtering by `--provider`, `--project`, `--enabled`, and `--disabled`.
- `integration status` shows runtime status for one binding or all bindings.
- Projects without integration bindings remain normal todu projects.

## Recurring miss policy via CLI

Recurring templates support two miss policies:

- `accumulate` — default behavior; missed occurrences still stack up and can be materialized as backlog tasks
- `rollForward` — only the latest due occurrence is represented; older missed dates do not create backlog debt

Create a recurring template with the default policy:

```bash
toduai recurring create \
  --title "Pay rent" \
  --schedule "FREQ=MONTHLY;BYMONTHDAY=1" \
  --project Home \
  --timezone America/Chicago \
  --start-date 2026-01-01
```

Create a recurring template that rolls forward instead of accumulating backlog:

```bash
toduai recurring create \
  --title "Water plants" \
  --schedule "FREQ=WEEKLY" \
  --project Home \
  --timezone America/Chicago \
  --start-date 2026-01-01 \
  --miss-policy rollForward
```

Update an existing template to change the policy:

```bash
toduai recurring update <template-id> --miss-policy accumulate
toduai recurring update <template-id> --miss-policy rollForward
```

Inspect the current policy in text or JSON output:

```bash
toduai recurring show <template-id>
toduai recurring list
toduai --format json recurring show <template-id>
```

Text output includes a `Miss Policy` field/column. JSON output includes `missPolicy`, and older templates without a stored field are displayed as `accumulate` for backward compatibility.

## Import backdated journal entries via CLI

Use `toduai note add` with `--created-at` to import historical journal entries without editing the datastore directly.

Create a backdated journal entry from an existing note:

```bash
toduai note add "Imported journal entry" \
  --created-at 2021-04-17T14:30:00Z \
  --tag imported \
  --tag journal
```

For scripted imports, emit one command per entry with the original timestamp:

```bash
toduai note add "Started new role today" --created-at 2019-06-03T09:00:00Z
toduai note add "Moved apartments" --created-at 2020-08-29T18:45:00Z
```

Behavior notes:
- `--created-at` accepts an ISO-8601 date or datetime string.
- Stored journal timestamps are normalized to ISO datetime form.
- Standalone journal notes are bucketed by the provided historical month, not by import time.
- Invalid `--created-at` input fails with a validation error.

## Validate connectivity

```bash
toduai daemon status
toduai --format json daemon status
```

If the daemon is healthy, status reports `running: true` and includes daemon health details.

## Join operations (per host daemon)

Use daemon-owned join flows from CLI:

```bash
toduai sync join <catalogId> --check
toduai sync join <catalogId>
toduai sync join <catalogId> --yes
```

Behavior:
- `--check` validates format + reachability only (no catalog switch)
- default join prompts for confirmation before transactional switch
- `--yes` skips confirmation for non-interactive automation
- result output includes previous/target catalog context and switch/rollback outcome

Operational note:
- Join is scoped to the local daemon instance.
- For multi-host setups, run join separately in each host/context that should switch datasets.

Authority migration references:
- [`plans/1923-automerge-sync-refactor-research.md`](plans/1923-automerge-sync-refactor-research.md) — authority migration sequence (Mac mini → k3s example)
- [`plans/phase-5-join-safety.md`](plans/phase-5-join-safety.md) — join safety coverage and migration validation matrix
- [`plans/phase-8-ops-controls.md`](plans/phase-8-ops-controls.md) — operational runbook deliverables for multi-host failover

## Expected fail-fast errors

### Daemon unavailable

Example output:

```text
Error: local daemon is required but unavailable (...). Start the daemon and retry.
```

Meaning:
- daemon is not running
- socket path is wrong
- socket permissions prevent connection

### Timeout

Example output:

```text
Error: Daemon request timed out after 10000ms
```

Meaning:
- daemon accepted connection but did not complete request in time
- daemon may be overloaded or blocked

### Protocol mismatch

Example output:

```text
Error: Protocol version mismatch
```

Meaning:
- CLI and daemon protocol versions are incompatible
- upgrade/downgrade CLI + daemon to matching versions

## Operational reminder

CLI targets one local daemon per invocation. Multi-host operations require running commands separately in each host/context.
