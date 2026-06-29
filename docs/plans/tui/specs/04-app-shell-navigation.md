# Spec 04: App Shell and Keyboard Navigation

## Objective

Build the TUI shell: frame, status line, view routing, keyboard handling, help overlay, and quit behavior.

## Usable Increment

After this spec, the app is navigable even if feature screens are still placeholders. Users can switch between Tasks, Projects, Data Status, and Help, and each route clearly shows either working data or a placeholder for the next spec.

## Scope

Included:

- App frame with header, main area, and help/status footer.
- Route state for at least `tasks`, `projects`, `data-status`, and `help`.
- Keyboard handling for global navigation.
- Help screen or overlay listing current shortcuts.
- Component tests for route changes and quit/back behavior.

Excluded:

- Fetching real task/project data.
- Domain mutations.
- Command palette, unless it is simpler than a static help screen.

## Suggested Files

- `packages/tui/src/app/routes.ts`
- `packages/tui/src/app/keymap.ts`
- `packages/tui/src/components/AppFrame.tsx`
- `packages/tui/src/components/HelpBar.tsx`
- `packages/tui/src/components/StatusLine.tsx`
- `packages/tui/src/screens/HelpScreen.tsx`

## Default Keymap

- `q`: back, or quit from root.
- `?`: help.
- `1`: tasks screen.
- `2`: projects screen.
- `tab`: cycle primary panes where applicable.
- `j/k` and arrows: move selection in focused lists.

## Acceptance Criteria

- The app can switch between Tasks, Projects, Data Status, and Help.
- Help accurately reflects implemented keys.
- Quit behavior is deterministic and tested.
- The shell remains usable at narrow terminal widths by truncating labels rather than throwing.

## Verification Plan

- Run package tests.
- Run package build.
- Manually launch and navigate between shell screens.

## Documentation Requirements

- Update the UX/keymap section of `docs/plans/tui/architecture.md` if keys differ.
