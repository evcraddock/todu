# Spec 07: Task Status Mutations

## Objective

Add keyboard-driven task status actions for triage.

## Usable Increment

After this spec, the TUI can perform core task triage end to end. Users can browse tasks and update the selected task's status without switching to CLI or Electron.

## Scope

Included:

- Add status mutation hooks/helpers for selected task.
- Implement shortcuts:
  - `s`: start / set `inprogress`
  - `w`: set `waiting`
  - `d`: mark `done`
  - `x`: cancel with confirmation
- Invalidate/refetch task queries after successful mutation.
- Show success/error feedback in the status line or toast area.
- Add tests for mutation params and keyboard action routing.

Excluded:

- Editing title/description/priority.
- Bulk actions.
- Comments.

## Suggested Files

- `packages/tui/src/state/task-actions.ts`
- `packages/tui/src/components/ConfirmDialog.tsx`
- `packages/tui/src/components/ToastLine.tsx`
- `packages/tui/src/screens/TasksScreen.tsx`

## Acceptance Criteria

- Mutations are disabled while disconnected.
- Non-destructive status changes do not require confirmation.
- Cancel requires confirmation.
- Successful mutations preserve selection where possible.
- Failed mutations show a readable error and do not optimistically hide the task unless confirmed by refetch.

## Verification Plan

- Run package tests.
- Run package build.
- Manually start, wait, complete, and cancel sample tasks against a daemon.

## Documentation Requirements

- Update `docs/plans/tui/architecture.md` if shortcut choices change.
