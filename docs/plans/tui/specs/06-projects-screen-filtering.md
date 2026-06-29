# Spec 06: Projects Screen and Task Filtering

## Objective

Add the MVP Projects screen and allow task filtering by selected project.

## Usable Increment

After this spec, Projects is a working screen, not a placeholder. Users can browse projects and immediately use a selected project to filter the task list.

## Scope

Included:

- Fetch and render project list.
- Render selected project detail summary.
- Add navigation from Projects to Tasks filtered by selected project.
- Add an `All projects` filter option for the Tasks screen.
- Preserve selected project across route switches when possible.
- Add tests for project rendering and task filter state.

Excluded:

- Project create/update/delete.
- Authorized assignee management.
- Integration binding views.

## Suggested Files

- `packages/tui/src/screens/ProjectsScreen.tsx`
- `packages/tui/src/state/project-filter.ts`
- `packages/tui/src/components/ProjectBadge.tsx`
- `packages/tui/src/screens/TasksScreen.tsx`

## UX Requirements

- `2` opens Projects.
- `enter` on a project opens Tasks filtered by that project.
- `a` or an explicit list item selects all projects.
- The header/status line shows the current project filter.

## Acceptance Criteria

- Projects screen works with loading, empty, and error states.
- Selecting a project filters task list results by project ID.
- Returning to all projects clears the filter.
- Tests prove project selection changes the task query/filter params.

## Verification Plan

- Run package tests.
- Run package build.
- Manually verify project filtering against a running daemon.

## Documentation Requirements

- Update `docs/plans/tui/architecture.md` if project filtering behavior changes.
