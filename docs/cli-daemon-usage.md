# CLI Daemon Usage Notes

`todu` now runs in daemon-first mode for task/project/label/note/recurring/habit/sync command groups.

For always-on daemon startup (recommended), use OS service manager setup from [`daemon-service-operations.md`](daemon-service-operations.md).

## Desktop companion CLI guidance

The desktop app does not require a separate CLI install for normal use. Packaged desktop releases bundle and manage the local daemon automatically.

Use the CLI as an optional companion for power-user workflows such as:

- checking daemon state (`todu daemon status`)
- explicit daemon lifecycle control (`todu daemon start|stop|restart`)
- automation and scripting
- plugin-oriented local operations

Recommended install paths:

- latest CLI: `npm install -g @todu/cli`
- CLI version matching desktop app version: `npm install -g @todu/cli@<desktop-version>`

Compatibility expectations:

- Preferred: use a CLI version that matches your installed desktop app version.
- Desktop app version is shown in Settings and in release notes.
- CLI and desktop app both use the same default user-local config and data paths, so they target the same local daemon and dataset by default.
- If needed, you can point the CLI at a different daemon socket with `TODU_DAEMON_SOCKET`.

## Standalone TUI guidance

The terminal UI is distributed as `@todu/tui` and exposes the `todu-tui` command:

```bash
npm install -g @todu/tui
todu-tui
```

If `@todu/cli` is installed too, running it without arguments launches the same TUI entrypoint:

```bash
todu
```

The explicit `todu tui` wrapper remains available.

Use the same version alignment rule as the CLI: prefer matching `@todu/tui`, `@todu/cli`, and desktop app versions. The TUI is released independently so each incremental terminal UI improvement can be versioned and published as soon as it lands.

Daemon-backed TUI screens use the same local daemon and dataset as the CLI and desktop app. Early scaffold releases may launch before daemon-backed screens exist; once daemon-backed functionality is present, start the daemon first if the TUI reports that it is unavailable.

## Config/data defaults

- Default home config path is `~/.config/todu/config.yaml`.
- `todu config init` creates `.todu/config.yaml` by default.
- `TODU_*` env vars are the only supported environment overrides.

### Bootstrap owner actor config

To override the default migrated owner actor (`actor-user` / `user`), set this in config **before the first startup that creates or migrates the dataset**:

```yaml
identity:
  ownerActor:
    id: erik
    displayName: Erik
```

Notes:
- This applies to fresh catalog creation and the first legacy-to-actor migration.
- If the dataset is already migrated, changing this config later does not rewrite existing actor IDs.
- Development remains isolated when you use `make dev`, `make run`, or `make dev-electron`, because those flows point at `.dev/config.yaml` instead of the home config.

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

You can also run the daemon binary directly:

```bash
todu-daemon
```

For local development from source:

```bash
npm run --workspace=packages/daemon dev
```

## Daemon log levels

Set daemon log level via `TODU_LOG_LEVEL`:

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

## Device registry management

The `device` command group manages the replicated roster for the local daemon's single dataset through its private local socket. It never connects directly to another daemon or enables a listener.

```bash
todu device list
todu --format json device list
todu device rename --name "Laptop"
todu device endpoint --url http://laptop.lan:24377
todu device endpoint --clear
todu device rename <enrolled-storage-id> --name "Mac mini"
todu device endpoint <enrolled-storage-id> --url http://mac-mini.lan:24377
todu device remove <enrolled-storage-id>
```

Naming and endpoint commands default to the daemon's automatically supplied persistent native Repo storage ID. Explicit IDs target another existing registry entry; removal requires an explicit ID. IDs are not transient connection peer IDs, physical hardware identities, or authenticated credentials. Listing does not establish that a device is online or fully synchronized.

Names default to the hostname and can be changed to a readable name of up to 100 characters. Endpoints accept HTTP(S) base URLs without credentials, paths, queries, or fragments. Exactly one of `--url` or `--clear` is required. An endpoint is shared metadata only: it cannot enable a listener, change its bind interfaces, or alter local server/worker settings. LAN listening requires separate explicit local configuration; automatic registry-based connections remain follow-up work.

Existing replicas initialize membership idempotently in place, preserving catalog and native storage IDs, data paths, configured server behavior, and worker assignments. Pending join storage does not self-enroll, even after restart. There is no generic add command: new replica membership requires the local approval-based enrollment flow below. An existing `sync join` operation is not membership approval.

Removal retains a replicated tombstone so normal startup cannot restore membership. It does not delete dataset documents or remote copies, instantly revoke access on offline replicas, or authenticate devices. The registry is connection metadata, not a transport authorization layer; the currently configured sync-server path remains unchanged. Take independent backups before rollout; do not retire a working sync server based on registry visibility alone.

See [Device Sync Design](architecture/device-sync.md) for the roadmap and trusted-LAN limitations.

## Opt-in LAN sync listener

The local daemon can accept native Automerge peer connections without a separate sync service. Listening is disabled by default and uses the existing dataset/Repo; it does not change the configured server or activate workers.

```bash
todu sync listener enable --bind 192.168.1.10
todu sync listener enable --bind 192.168.1.10 --port 24400
todu daemon restart
todu sync listener status
todu --format json sync listener status
todu sync status
```

Equivalent local configuration:

```yaml
sync:
  listener:
    enabled: true
    bind: 192.168.1.10
    port: 24377
```

Supply a literal IPv4/IPv6 address assigned to this machine. There is no implicit interface or hostname-based binding. The default port is `24377`; zero/ephemeral ports and automatic port substitution are refused. Explicit all-interface addresses are supported but expose every matching interface; IPv6 bindings do not implicitly listen on IPv4.

Configuration commands preserve other settings and YAML comments. They do **not** change a running listener or restart the daemon: restart explicitly to apply, using the same configuration context as the daemon. `--config` selects the file to edit; a service-managed daemon still reads the configuration selected by its service. Registry endpoint metadata is not automatically edited.

Disable listening with:

```bash
todu sync listener disable
todu daemon restart
```

Saving the disabled flag alone does not stop a running listener. Before travel to an untrusted network, apply the restart or stop the daemon. Existing `sync start|stop|restart` controls the outbound configured-server path only, not LAN listening.

The native WebSocket endpoint is `ws://<address>:<port>/sync/<current-catalog-id>` (bracket IPv6 addresses in URLs). Wrong-catalog and non-exact upgrade paths are refused. The shared listener accepts metadata-only enrollment requests/polls; other HTTP routes, remote RPC, and remote approval return `404`. Binding errors appear in listener status and daemon logs while private local reads/edits remain available. Listener status is separate from outbound server state and does not claim synchronization completeness.

**Trusted LAN only:** HTTP/WebSocket transport is unencrypted and unauthenticated. The registry is not an access-control list; any reachable peer knowing the catalog path can attempt native replication. Restrict exposure through the operator's network configuration. No authentication, encrypted pairing, internet traversal, or per-document sharing filter is provided.

This supplies incoming transport for explicit enrollment and native replication. Automatic roster-derived connections remain separate work; enabling a listener alone does not make other daemons connect or remove the need for an existing working server.

## Locally approved device enrollment

Use one known listening peer's base endpoint; do not copy catalog/storage IDs or put a `/sync/...` path in the command. The listener must already be explicitly enabled on the receiving device. The exchange is trusted-LAN-only operational approval, not authenticated or encrypted pairing.

On a genuinely pristine installation, **before first daemon/desktop startup**:

```bash
todu sync enrollment prepare
todu daemon start
todu sync enroll http://mac-mini.lan:24377
todu sync enrollment status
```

Preparation creates only machine-local pending state, not a default catalog. Pending startup obtains/persists the native replica ID automatically but has no live dataset or document connection and runs no plugins, workers, or host processing. Domain commands remain unavailable until approval and valid catalog attachment. If a daemon/service already started normally, even an empty dataset is initialized and cannot be replaced by this command. Do not delete existing storage to force pristine eligibility.

An existing **same-dataset** replica skips preparation and runs `todu sync enroll <base-endpoint>` against its current daemon. Its catalog/storage IDs, existing data, server settings, provider-local state, assignments, and running workers are retained. A different initialized dataset is refused without merging or replacement.

On the receiving device, inspect and decide locally:

```bash
todu sync enrollment list
todu sync enrollment approve <request-id>
# or:
todu sync enrollment deny <request-id>
```

The request ID is a local request selector displayed by `list`, not a catalog/storage ID to transfer between machines. Responses contain metadata only. The requesting daemon polls and, after approval plus eligibility validation, attaches native bidirectional replication through that peer. `status` reports `prepared`, `pending`, `attaching`, `active`, `denied`, `expired`, `error`, or `cancelled`; `active` records successful activation, not ongoing connection health or complete offline readiness. Use `--format json` for structured output.

The approved-source link survives daemon restart without changing `sync.remote` or listener settings. Pristine approval does not activate workers or host startup processing; a later explicit normal restart honors locally configured startup/worker settings. Source plugin credentials/configuration are not imported.

Requests expire after ten minutes while pending. The source journal retains at most 128 request records and accepts at most 8 KiB metadata bodies. HTTP exchanges have a five-second deadline. Retries retain the native ID, reuse/deduplicate request state, and never create substitute catalogs or duplicate membership. An approved but failed pristine attachment remains bound to that dataset; retained cached data is not reused to join a different dataset. Keep the same config/data/socket context when retrying.

To abandon pending enrollment locally:

```bash
todu sync enrollment cancel
```

Cancellation stops local pending work, but retains native identity and cached data. Unapproved source requests expire; already-approved membership remains even if attachment never finishes. Pending cleanup must not remove existing members' entries or dataset documents. Inspect stale roster entries and manage them explicitly with `device` commands. Once active, cancellation is refused rather than clearing the dataset or removing its membership. Removed identities are not automatically restored.

See [Device Sync Design](architecture/device-sync.md#managed-enrollment) for failure, partial approval, and trusted-LAN limitations. Approval gates the managed flow only; peers already knowing the native catalog route can still attempt replication.

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
- Empty assignment (`TODU_DAEMON_ASSIGNED_WORKERS=""`) means no local workers are assigned.
- Duplicate entries are tolerated and logged; first occurrence wins.

## Plugin module configuration

Configure worker plugin module entrypoints in the config file. Local filesystem paths must be absolute or start with `.`; npm package specifiers remain unchanged:

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
- Config entries that are absolute or start with `.` are filesystem paths; dot-relative paths resolve from the config file directory. Other entries are npm package specifiers.
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

Recurring worker npm plugin example (no source checkout or daemon/core dependency wiring required):

```bash
npm install -g @todu/recurring-worker@0.1.1
todu plugin install @todu/recurring-worker
todu plugin config recurring-worker --set '{"intervalSeconds":30}'
```

See [Recurring Worker Installation](recurring-worker-installation.md) for the tested version matrix, activation steps, current published-version compatibility workaround, verification procedure, and update policy.

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

## Actor management via CLI

Manage catalog actors directly through the local daemon:

```bash
todu actor list
todu --format json actor list

todu actor create --id actor-reviewer --name "Reviewer"
todu actor rename actor-reviewer --name "Lead Reviewer"
todu actor archive actor-reviewer
todu actor unarchive actor-reviewer

todu actor owner show
todu actor owner set actor-reviewer
```

Behavior notes:
- `actor list` shows actor IDs, display names, and archived state in both text and JSON output.
- `actor create` rejects duplicate actor IDs.
- `actor rename` updates only the display name; actor IDs remain stable.
- `actor archive` and `actor unarchive` toggle archived state without deleting the actor.
- `actor owner show` displays the current catalog owner actor clearly in text and JSON output.
- `actor owner set <actor-id>` changes the canonical `ownerActorId` only after validating that the target actor exists and is not archived.
- The owner actor has special semantics: legacy `"user"` identity fallback, default note authorship, approval reviewer attribution, and default project authorization all follow the current catalog owner.
- Changing the owner actor does not silently rewrite unrelated actors or existing project authorization lists.
- The current owner actor cannot be archived; switch the owner first if needed.
- Invalid actor operations return daemon-backed validation or not-found errors.

## Project authorization and actor-aware task surfaces

Project authorization is managed through each project's `authorizedAssigneeActorIds` allowlist.

Examples:

```bash
todu actor create --id actor-reviewer --name "Reviewer"

todu project auth show proj-123
todu project auth add proj-123 actor-reviewer
todu project auth remove proj-123 actor-reviewer
todu project auth set proj-123 actor-user actor-reviewer

todu task create --title "Pair on rollout" --project proj-123 --assignee-actor actor-user

todu task update task-123 --assignee-actor actor-user actor-reviewer
todu task update task-123 --clear-assignees

todu task show task-123
todu task list --project proj-123
todu project show proj-123

todu note add "Imported comment" --task task-123 --author-actor actor-reviewer
todu note list --author-actor actor-reviewer
```

Behavior notes:
- `project auth show` displays the authorized actor list with display names and actor IDs.
- `project auth add`, `remove`, and `set` use daemon-backed project authorization updates instead of editing raw project JSON indirectly.
- `project auth set` replaces the full authorized list; omitting actor IDs clears it.
- `project show` text and JSON output include resolved `authorizedActors` and any `staleUnauthorizedAssignees` still present on project tasks.
- `task create --assignee-actor` and `task update --assignee-actor` set actor-based task assignment by actor ID.
- `task update --clear-assignees` clears actor-based task assignment.
- `task show` and `task list` mark archived or unauthorized assignees instead of silently hiding them.
- JSON task output now includes `assigneeActors` with resolved actor display metadata and authorization state.
- `note add --author-actor` and `note list --author-actor` work with actor-based note authorship.
- `note` text output shows actor-based author names and imported-content approval state when applicable.
- Legacy `--author` note filtering/input remains available during the compatibility window.

## Approval workflow via CLI

Use explicit approval commands for imported task descriptions and note/comment content:

```bash
todu approval list
todu approval list --kind task
todu approval list --kind note

todu approval approve task-description task-123
todu approval approve note-content note-123
```

Behavior notes:
- `approval list` shows only content currently pending approval.
- `approval list --kind task|note` filters by task descriptions vs note/comment content.
- `approval approve task-description <task-id>` approves the current imported task description revision explicitly.
- `approval approve note-content <note-id>` approves the current imported note/comment revision explicitly.
- Approval actions reject unknown items, content that is already approved, and content that does not require approval.
- `task show` and `note list` continue to display current approval state in normal detail output.
- JSON output for `approval list` and `approval approve ...` remains structured for automation.

## Validate connectivity

```bash
todu daemon status
todu --format json daemon status
```

If the daemon is healthy, status reports `running: true` and includes daemon health details.

## Join operations (per host daemon)

Use daemon-owned join flows from CLI:

```bash
todu sync status
todu sync start
todu sync stop
todu sync restart
todu sync join <catalogId> --check
todu sync join <catalogId>
todu sync join <catalogId> --yes
```

Behavior:
- `status` reports local daemon sync mode and remote sync state
- `start`, `stop`, and `restart` control the daemon-owned remote sync adapter
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
