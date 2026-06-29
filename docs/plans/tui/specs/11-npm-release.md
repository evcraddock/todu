# Spec 11: Standalone NPM Release

## Objective

Make the TUI a standalone npm-distributed app with its own release path, similar in shape to `@todu/cli`.

## Usable Increment

After this spec, users can install and run the TUI as its own npm package, independent of the CLI package, while still connecting to the same local Todu daemon and dataset.

## Scope

Included:

- Configure `@todu/tui` as a publishable package.
- Expose a standalone binary, recommended `todu-tui`.
- Keep `todu tui` as an optional convenience wrapper if already implemented, but do not make the TUI depend on the CLI package for distribution.
- Ensure package metadata, `files`, `bin`, `main`, `types`, `publishConfig`, and build output match npm publishing expectations.
- Add or update release scripts/checks so the TUI can be versioned and packed like `@todu/cli`.
- Verify the package with `npm pack --workspace=@todu/tui`.
- Document standalone install and upgrade guidance.

Excluded:

- Desktop/Electron installer changes.
- Daemon packaging changes beyond documenting that the standalone TUI requires a running local daemon.
- Publishing automation to npm during the implementation task unless explicitly requested.

## Suggested Files

- `packages/tui/package.json`
- `packages/tui/generate-version.mjs`, if the CLI version generation pattern is reused
- `package.json`
- `README.md`
- `docs/cli-daemon-usage.md`
- `docs/plans/tui/architecture.md`

## UX / Distribution Requirements

- Primary standalone command: `todu-tui`.
- Installation example:

```bash
npm install -g @todu/tui
```

- The TUI should clearly report when the local daemon is unavailable and instruct the user to start it.
- Compatibility guidance should recommend aligning `@todu/tui`, `@todu/cli`, and desktop app versions.

## Acceptance Criteria

- `@todu/tui` has npm-ready package metadata and publish configuration.
- `npm pack --workspace=@todu/tui` produces a package containing only the expected distributable files.
- Installing the packed package exposes `todu-tui`.
- `todu-tui` launches the built TUI and uses the local daemon path.
- Documentation explains standalone installation, upgrade, and daemon requirements.
- Release/versioning behavior is aligned with `@todu/cli` where practical.

## Verification Plan

- Run `npm run --workspace=@todu/tui build`.
- Run `npm run --workspace=@todu/tui test`, if present.
- Run `npm pack --workspace=@todu/tui`.
- Install the generated tarball in a temporary prefix and verify `todu-tui --help` or launch behavior.
- Run relevant root checks before commit.

## Documentation Requirements

- Update README install docs to describe the TUI as its own npm app.
- Update `docs/plans/tui/architecture.md` with the chosen standalone release model.
