# Spec 05: Task List and Detail Read Model

## Objective

Implement the read-only task experience: list active tasks, move selection, and show selected task details.

## Usable Increment

After this spec, the default Tasks screen is genuinely useful for reading and triaging context: users can launch the app, browse current tasks, and inspect the selected task without leaving the TUI.

## Scope

Included:

- Fetch tasks through the daemon domain client.
- Render task list with title, status, priority, project label where available, and labels if space allows.
- Render selected task details in a second pane.
- Preserve selection across refetch when the selected task still exists.
- Add loading, empty, and error states.
- Add tests for formatting, selection preservation, and basic rendering.

Excluded:

- Project screen.
- Task mutation shortcuts.
- Search/filter input.
- Event-driven refresh.

## Suggested Files

- `packages/tui/src/screens/TasksScreen.tsx`
- `packages/tui/src/components/ListPane.tsx`
- `packages/tui/src/components/DetailPane.tsx`
- `packages/tui/src/formatting/priority.ts`
- `packages/tui/src/formatting/status.ts`
- `packages/tui/src/formatting/truncate.ts`
- `packages/tui/src/state/selection.ts`

## Acceptance Criteria

- Active/in-progress/waiting tasks render in a scrollable or windowed list.
- `j/k` and arrow keys change the selected task.
- The detail pane updates as selection changes.
- Empty state tells the user there are no matching tasks.
- Error state shows a clear daemon/domain error.
- Tests cover list rendering, selection movement, and selected-detail rendering.

## Verification Plan

- Run package tests.
- Run package build.
- Manually run against a daemon with sample tasks.

## Documentation Requirements

- Update `docs/plans/tui/architecture.md` if the task read layout diverges materially from the plan.
