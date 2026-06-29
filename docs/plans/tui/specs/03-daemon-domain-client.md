# Spec 03: Daemon Domain Client and Query Cache

## Objective

Add a typed TUI daemon-backed Todu client plus React Query setup for server state.

## Usable Increment

After this spec, the running app includes a simple data status screen or panel that fetches real daemon data and displays project/task counts. This makes the client/query plumbing visible before the full task UI exists.

## Scope

Included:

- Create a TUI-local domain client that wraps daemon RPC calls.
- Add query client provider wiring for the Ink app.
- Add query keys for actors, projects, tasks, task detail, comments/notes, and sync status.
- Add Result unwrapping/error formatting helpers modeled loosely after Electron.
- Add a minimal visible data status screen/panel that fetches and displays project/task counts.
- Add tests for method mapping and error mapping.

Excluded:

- Full task/project screen implementation.
- Mutations beyond minimal plumbing tests.
- Event-driven invalidation.

## Suggested Files

- `packages/tui/src/daemon/todu-client.ts`
- `packages/tui/src/daemon/todu-client.test.ts`
- `packages/tui/src/state/query-client.tsx`
- `packages/tui/src/state/query-keys.ts`
- `packages/tui/src/state/result.ts`
- `packages/tui/src/screens/DataStatusScreen.tsx`

## Acceptance Criteria

- The client maps at least these RPC methods:
  - `project.list`
  - `project.get`
  - `task.list`
  - `task.get`
  - `task.update`
  - `task.comment.create` or the daemon's existing note/comment method, as appropriate.
- Domain errors render as user-facing messages, not raw protocol frames.
- Query provider is available to the root Ink app.
- The app has a runnable visible screen/panel that displays project/task counts from daemon data.
- Tests prove request method names and params are correct.

## Verification Plan

- Run package tests.
- Run package build.
- If a fake daemon is available, fetch projects/tasks through the client in a focused integration test.

## Documentation Requirements

- Update `docs/plans/tui/architecture.md` if method coverage or query key strategy changes.
