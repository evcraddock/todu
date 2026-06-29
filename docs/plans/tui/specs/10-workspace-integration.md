# Spec 10: Workspace and CLI Integration

## Objective

Integrate the TUI into the Todu workspace and expose the user-facing launch path.

## Usable Increment

After this spec, the usable TUI is accessible through the normal Todu launch path, documented for users, and covered by workspace checks.

## Scope

Included:

- Add root scripts for TUI build/typecheck/test as appropriate.
- Decide and implement launch path:
  - preferred: `todu tui`
  - optional later: `todu-tui`
- Ensure package build output is included in package files/bin config.
- Add documentation for installing and launching the TUI.
- Add final CI/check integration once package tests are stable.

Excluded:

- New TUI features.
- Desktop installer changes unless needed for documentation.
- Publishing a separate package unless explicitly chosen.

## Suggested Files

- `package.json`
- `packages/cli/src/**`
- `packages/tui/package.json`
- `README.md`
- `docs/cli-daemon-usage.md`
- `docs/plans/tui/architecture.md`

## Acceptance Criteria

- `todu tui` launches the TUI from a built or development workspace.
- Root typecheck/build includes TUI, or the spec documents why it remains package-local temporarily.
- README explains the TUI as a third client alongside CLI and Electron.
- CI-relevant commands pass.

## Verification Plan

- Run `npm run --workspace=@todu/tui build`.
- Run `npm run --workspace=@todu/tui test`, if present.
- Run root `npm run typecheck` or the updated equivalent.
- Run root `npm run check:ci` if feasible.
- Manually launch `todu tui`.

## Documentation Requirements

- Update README client overview/install usage.
- Update `docs/plans/tui/architecture.md` with the chosen entry point.
