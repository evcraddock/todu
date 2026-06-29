# Spec 08: Task Comment Modal

## Objective

Allow users to add a comment/note to the selected task from the TUI.

## Usable Increment

After this spec, the TUI supports a complete read-update-comment task workflow. Users can add context to the selected task and see it after refresh/refetch.

## Scope

Included:

- Add a keyboard shortcut to open comment input, recommended `c`.
- Implement a modal or focused input area for comment text.
- Submit comment through the daemon domain client.
- Invalidate task detail/comments after success.
- Support cancel via `escape`.
- Add tests for input, submit, cancel, and mutation params.

Excluded:

- Rich markdown editing.
- Editing or deleting comments.
- Standalone journal notes.

## Suggested Files

- `packages/tui/src/components/TextInputModal.tsx`
- `packages/tui/src/state/comment-actions.ts`
- `packages/tui/src/screens/TasksScreen.tsx`

## UX Requirements

- `c` opens comment input for the selected task.
- `enter` submits single-line comments.
- If multiline input is added, document the submit shortcut clearly.
- Empty comments should be rejected client-side with a clear message.

## Acceptance Criteria

- Comment action is unavailable when no task is selected.
- Empty/whitespace-only comments are not sent.
- Successful comments are visible after refetch.
- Cancel returns focus to the prior screen without mutation.

## Verification Plan

- Run package tests.
- Run package build.
- Manually add a comment to a sample task and verify it appears in task details or notes.

## Documentation Requirements

- Update `docs/plans/tui/architecture.md` if comment UX or shortcut differs.
