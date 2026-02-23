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

## Validate connectivity

```bash
toduai daemon status
toduai --format json daemon status
```

If the daemon is healthy, status reports `running: true` and includes daemon health details.

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
