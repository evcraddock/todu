# Spec 01: TUI Package Scaffold

## Objective

Create the `@todu/tui` workspace package with a minimal Ink app that builds and exits cleanly.

## Usable Increment

After this spec, the app launches, renders a minimal screen, and can be quit from the keyboard. This is the first runnable baseline.

## Scope

Included:

- Add `packages/tui` workspace package.
- Add package-local TypeScript config and build script.
- Add a minimal executable entry point.
- Render a simple Ink screen such as `todu TUI coming online`.
- Add one smoke test for rendering the root component.

Excluded:

- Daemon connection.
- Domain data fetching.
- Root `todu tui` CLI integration.
- Root workspace build integration beyond workspace discovery.

## Suggested Files

- `packages/tui/package.json`
- `packages/tui/tsconfig.json`
- `packages/tui/tsconfig.build.json`
- `packages/tui/src/index.tsx`
- `packages/tui/src/app/App.tsx`
- `packages/tui/src/app/App.test.tsx`

## Acceptance Criteria

- `npm run --workspace=@todu/tui build` succeeds.
- `npm run --workspace=@todu/tui test` succeeds, if a package test script is added.
- Running the package entry point displays a minimal TUI and exits via `q` or `Ctrl+C`.
- The package does not import `@todu/engine` startup/storage ownership code.

## Verification Plan

- Run package build.
- Run package tests.
- Manually launch the entry point in a terminal and quit.

## Documentation Requirements

- Update `docs/plans/tui/architecture.md` if the package layout differs from the proposed layout.
