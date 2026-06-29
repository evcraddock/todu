# Spec 02: Daemon Connection Lifecycle

## Objective

Add a TUI-local daemon connection layer that can connect to the local daemon, run `daemon.hello`, and report connection lifecycle state to the UI.

## Usable Increment

After this spec, launching the app shows live daemon connection state. With the daemon running, the screen confirms the handshake. With the daemon stopped, the screen gives actionable startup guidance.

## Scope

Included:

- Implement a connection manager for the daemon JSON-RPC transport.
- Use the same timeout/backoff behavior as Electron where practical.
- Expose connection states: `connecting`, `connected`, `reconnecting`, `disconnected`, `failed`.
- Show a blocking daemon-unavailable screen at startup.
- Add unit tests with a fake socket or fake connector.

Excluded:

- Domain-specific Todu client methods.
- Event subscriptions beyond what is necessary to prove lifecycle.
- Shared package extraction with Electron.

## Suggested Files

- `packages/tui/src/daemon/connection.ts`
- `packages/tui/src/daemon/connection.test.ts`
- `packages/tui/src/daemon/hello.ts`
- `packages/tui/src/components/ConnectionState.tsx`

## Acceptance Criteria

- The TUI attempts `daemon.hello` after connecting.
- Startup failure clearly says how to start the daemon, e.g. `todu daemon start`.
- Connection attempts use bounded timeouts.
- Reconnect scheduling uses capped backoff.
- Tests cover successful connect, failed connect, request timeout, and disconnect transition.

## Verification Plan

- Run `npm run --workspace=@todu/tui test`.
- Run package build.
- Manually launch with daemon stopped and verify the error screen.
- Manually launch with daemon running and verify connected state.

## Documentation Requirements

- Document any intentional divergence from Electron connection behavior in `docs/plans/tui/architecture.md`.
