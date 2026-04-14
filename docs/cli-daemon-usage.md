# CLI Daemon Usage Notes

`todu` now runs in daemon-first mode for task/project/label/note/recurring/habit/sync command groups.

The legacy `todu serve` path has been removed.

For always-on daemon startup (recommended), use OS service manager setup from [`daemon-service-operations.md`](daemon-service-operations.md).

## Config/data migration defaults

- Default home config path is now `~/.config/todu/config.yaml`.
- Existing `~/.config/toduai` state is migrated automatically to `~/.config/todu` when the new default path is absent.
- `todu config init` now creates `.todu/config.yaml` by default and migrates a sibling `.toduai/` directory when present.
- Absolute legacy config values under `~/.config/toduai/...` or `.toduai/...` are normalized to `todu` paths when config is loaded.
- `TODU_*` env vars are primary; legacy `TODUAI_*` env vars remain supported temporarily as fallback.

## Start/stop/restart the local daemon

Recommended for persistent operation:

- Use OS service manager setup in [`daemon-service-operations.md`](daemon-service-operations.md)
- Then control lifecycle through your service manager (`systemctl --user` / `launchctl`)

CLI wrappers are available:

```bash
todu daemon start
todu daemon stop
todu daemon restart
```

Wrapper behavior:

- **Delegates** to system service managers when configured (`systemd --user` on Linux, `launchd` on macOS).
- Falls back to **direct managed mode** when no service registration exists.
- Direct mode tracks a managed PID at `<data_dir>/daemon.pid` and refuses to stop unmanaged daemon processes.
- Direct mode appends stdout/stderr logs to `<data_dir>/daemon.out.log` and `<data_dir>/daemon.err.log`.
- On `daemon start`/`daemon restart`, oversized direct log files are rotated to `.1` and `.2` before the new process starts.

Foreground daemon run (manual/interactive) is still available:

```bash
todu daemon run
```

You can also run the daemon binary directly (current compatibility name):

```bash
toduai-daemon
```

For local development from source:

```bash
npm run --workspace=packages/daemon dev
```

## Daemon log levels

Set daemon log level via `TODU_LOG_LEVEL` (legacy `TODUAI_LOG_LEVEL` is still accepted during the transition):

- `error`
- `warn`
- `info` (default)
- `debug`

Examples:

```bash
TODU_LOG_LEVEL=debug make dev
TODU_LOG_LEVEL=warn todu daemon run
```

`debug` adds RPC operation context (method, request id, param keys, outcome, duration) to help trace CRUD flows.

## How CLI finds the daemon socket

By default, CLI connects to:

- `<data_dir>/daemon.sock`

Override with:

- `TODU_DAEMON_SOCKET=/path/to/daemon.sock`
- legacy fallback: `TODUAI_DAEMON_SOCKET=/path/to/daemon.sock`

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
export TODU_DAEMON_ASSIGNED_WORKERS="recurring,github-sync"
```

Notes:
- Env var overrides config file assignment.
- Legacy fallback: `TODUAI_DAEMON_ASSIGNED_WORKERS`.
- Empty assignment (`TODU_DAEMON_ASSIGNED_WORKERS=""`) means no local workers are assigned.
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
export TODU_DAEMON_PLUGIN_PATHS="/opt/todu/plugins/github/index.js,/opt/todu/plugins/forgejo/index.js"
```

Notes:
- Env var overrides config file plugin paths.
- Legacy fallback: `TODUAI_DAEMON_PLUGIN_PATHS`.
- Config file plugin paths are resolved relative to the config file directory.
- Empty plugin path list (`TODU_DAEMON_PLUGIN_PATHS=""`) disables plugin loading.
- Duplicate entries are tolerated and logged; first occurrence wins.
- Changes require daemon restart to apply.

## Plugin management commands

Use CLI plugin commands to manage configured sync plugin modules:

```bash
todu plugin install <module-path-or-package>
todu plugin list
todu plugin remove <plugin-name-or-module-path>
todu plugin config <plugin-name-or-module-path>
todu plugin config <plugin-name-or-module-path> --set '{"key":"value"}'
todu plugin config <plugin-name-or-module-path> --clear
```

Behavior notes:
- `plugin install` validates plugin exports before saving config.
- Supported plugin exports are `workerPlugin` (generic worker plugin) and `syncProvider` (sync provider plugin).
- `plugin list` shows configured plugins, plugin kind, and daemon runtime worker state when daemon is available.
- `plugin remove` and `plugin install` report when daemon restart is required for activation/removal.
- `plugin config --set` requires a JSON object.

Recurring worker standalone plugin example (no daemon/core dependency wiring required):

```bash
todu plugin install ./packages/recurring-worker/dist/index.js
todu plugin config recurring-worker --set '{"intervalSeconds":30}'
```

Per-plugin sync scheduler fields are configured through `plugin config --set`:

```bash
todu plugin config github --set '{"intervalSeconds":300,"retryInitialSeconds":5,"retryMaxSeconds":60,"settings":{"token":"env:GITHUB_TOKEN"}}'
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
todu integration list
todu integration list --provider github
todu integration add --provider github --project Work --target-kind repository --target owner/repo
todu integration add --provider forgejo --project Work --target-kind repository --target owner/repo --options '{"importClosedOnBootstrap":true}'
todu integration update <binding-id> --target-kind repository --target owner/renamed-repo
todu integration update <binding-id> --options '{"importClosedOnBootstrap":false}'
todu integration set-strategy <binding-id> --strategy pull
todu integration enable <binding-id>
todu integration disable <binding-id>
todu integration remove <binding-id>
todu integration status
todu integration status <binding-id>
```

Behavior notes:
- Integration bindings are the generic shared control plane for external integrations.
- Project commands no longer expose project-level external sync settings; use `todu integration ...` to manage external sync intent.
- Provider-specific credential setup stays out of `integration add|update|remove` and remains local to the authority daemon host.
- `integration add` and `integration update` accept `--options <json>` for provider-specific desired-state binding options.
- Binding `options` are shared user intent only; do not store secrets, tokens, cursors, retry state, or diagnostics there.
- `integration list` supports filtering by `--provider`, `--project`, `--enabled`, and `--disabled`.
- `integration status` shows runtime status for one binding or all bindings.
- Projects without integration bindings remain normal todu projects.

## Recurring miss policy via CLI

Recurring templates support two miss policies:

- `accumulate` — default behavior; missed occurrences still stack up and can be materialized as backlog tasks
- `rollForward` — only the latest due occurrence is represented; older missed dates do not create backlog debt

Create a recurring template with the default policy:

```bash
todu recurring create \
  --title "Pay rent" \
  --schedule "FREQ=MONTHLY;BYMONTHDAY=1" \
  --project Home \
  --timezone America/Chicago \
  --start-date 2026-01-01
```

Create a recurring template that rolls forward instead of accumulating backlog:

```bash
todu recurring create \
  --title "Water plants" \
  --schedule "FREQ=WEEKLY" \
  --project Home \
  --timezone America/Chicago \
  --start-date 2026-01-01 \
  --miss-policy rollForward
```

Update an existing template to change the policy:

```bash
todu recurring update <template-id> --miss-policy accumulate
todu recurring update <template-id> --miss-policy rollForward
```

Inspect the current policy in text or JSON output:

```bash
todu recurring show <template-id>
todu recurring list
todu --format json recurring show <template-id>
```

Text output includes a `Miss Policy` field/column. JSON output includes `missPolicy`, and older templates without a stored field are displayed as `accumulate` for backward compatibility.

## Import backdated journal entries via CLI

Use `todu note add` with `--created-at` to import historical journal entries without editing the datastore directly.

Create a backdated journal entry from an existing note:

```bash
todu note add "Imported journal entry" \
  --created-at 2021-04-17T14:30:00Z \
  --tag imported \
  --tag journal
```

For scripted imports, emit one command per entry with the original timestamp:

```bash
todu note add "Started new role today" --created-at 2019-06-03T09:00:00Z
todu note add "Moved apartments" --created-at 2020-08-29T18:45:00Z
```

Attach a comment to a habit from the CLI:

```bash
todu note add "Floss method: Water Pick" --habit hab-123
todu --format json note list --habit hab-123
```

Filter notes by created-at date range:

```bash
todu --format json note list --from 2026-03-01 --to 2026-03-31
todu --format json note list --tag journal --from 2026-03-01T00:00:00Z --to 2026-03-31T23:59:59Z
todu --format json note list --journal --from 2026-03-01 --to 2026-03-31
```

Behavior notes:
- `--created-at` accepts an ISO-8601 date or datetime string.
- `note list --from/--to` accepts either `YYYY-MM-DD` or ISO-8601 date/datetime strings.
- `note list --journal` limits results to standalone notes with no task, project, or habit attachment.
- Stored journal timestamps are normalized to ISO datetime form.
- Standalone journal notes are bucketed by the provided historical month, not by import time.
- Invalid note date input fails with a validation error.
- `--habit <id>` attaches a note to a habit or filters notes for a habit.

Filter tasks by created-at date range:

```bash
todu --format json task list --from 2026-03-01 --to 2026-03-31
todu --format json task list --project proj-123 --from 2026-03-01T00:00:00Z --to 2026-03-31T23:59:59Z
```

Filter tasks by updated-at date range (for monthly review and reporting):

```bash
todu --format json task list --status done --updated-from 2026-03-01 --updated-to 2026-03-31
```

Task date-range behavior notes:
- `task list --from/--to` uses created-at timestamps, not due dates.
- `task list --updated-from/--updated-to` uses the `updatedAt` timestamp.
- Both accept either `YYYY-MM-DD` or ISO-8601 date/datetime strings.
- For monthly review, use `--status done --updated-from/--updated-to` to find tasks completed during the target month.
- Invalid task date input fails with a validation error.

## Actor-aware task and note surfaces

Task and note text output now prefers actor-based identity data when available.

Examples:

```bash
todu task create --title "Pair on rollout" --project proj-123 --assignee-actor actor-user

todu task update task-123 --assignee-actor actor-user actor-reviewer
todu task update task-123 --clear-assignees

todu task show task-123
todu project show proj-123

todu note add "Imported comment" --task task-123 --author-actor actor-reviewer
todu note list --author-actor actor-reviewer
```

Behavior notes:
- `task create --assignee-actor` and `task update --assignee-actor` set actor-based task assignment by actor ID.
- `task update --clear-assignees` clears actor-based task assignment.
- `task show` text output displays actor assignees and imported description approval state when applicable.
- `project show` text output displays the project's authorized assignee actors.
- `note add --author-actor` and `note list --author-actor` work with actor-based note authorship.
- `note` text output shows actor-based author names and imported-content approval state when applicable.
- Legacy `--author` note filtering/input remains available during the compatibility window.

## Validate connectivity

```bash
todu daemon status
todu --format json daemon status
```

If the daemon is healthy, status reports `running: true` and includes daemon health details.

## Join operations (per host daemon)

Use daemon-owned join flows from CLI:

```bash
todu sync join <catalogId> --check
todu sync join <catalogId>
todu sync join <catalogId> --yes
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
