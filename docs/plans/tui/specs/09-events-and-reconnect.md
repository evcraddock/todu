# Spec 09: Events, Cache Invalidation, and Reconnect Recovery

## Objective

Wire daemon event subscriptions into the TUI so data stays fresh and reconnect recovery is visible.

## Usable Increment

After this spec, the already-usable TUI becomes live. Users can keep it open while data changes from another client and while the daemon restarts, with visible status and automatic refresh.

## Scope

Included:

- Subscribe to `data.changed` and `sync.statusChanged` after hello.
- Invalidate relevant React Query caches on `data.changed`.
- Update sync/connection status on `sync.statusChanged`.
- On reconnect, rerun hello, resubscribe, and invalidate active queries.
- Keep last known data visible during reconnect when available.
- Add tests for event handling and reconnect invalidation.

Excluded:

- Payload-specific narrow invalidation unless already easy.
- Offline mutation queueing.
- Full sync diagnostics screen.

## Suggested Files

- `packages/tui/src/daemon/events.ts`
- `packages/tui/src/state/event-invalidation.ts`
- `packages/tui/src/components/StatusLine.tsx`
- `packages/tui/src/daemon/connection.ts`

## Acceptance Criteria

- `data.changed` causes task/project queries to refetch or become stale.
- `sync.statusChanged` updates the status line without requiring a full app refresh.
- Reconnect path resubscribes exactly once per new connection.
- Disconnected state disables mutations and displays `reconnecting` or equivalent.
- Tests cover event dispatch, invalidation, and reconnect sequence.

## Verification Plan

- Run package tests.
- Run package build.
- Manually run TUI, modify data from CLI/Electron, and verify TUI refreshes.
- Restart daemon while TUI is open and verify recovery.

## Documentation Requirements

- Update `docs/plans/tui/architecture.md` if event or reconnect semantics change.
