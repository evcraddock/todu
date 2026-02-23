# CLI Daemon Usage Notes

`toduai` now runs in daemon-first mode for task/project/label/note/recurring/habit/sync command groups.

## Start the local daemon

Use the daemon package entrypoint:

```bash
toduai-daemon
```

For local development from source:

```bash
npm run --workspace=packages/daemon dev
```

## How CLI finds the daemon socket

By default, CLI connects to:

- `<data_dir>/daemon.sock`

Override with:

- `TODUAI_DAEMON_SOCKET=/path/to/daemon.sock`

## Validate connectivity

```bash
toduai sync status
```

If the daemon is healthy, this returns sync/local mode status.

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
Error: Unsupported protocol version: <version>
```

Meaning:
- CLI and daemon protocol versions are incompatible
- upgrade/downgrade CLI + daemon to matching versions

## Operational reminder

CLI targets one local daemon per invocation. Multi-host operations require running commands separately in each host/context.
