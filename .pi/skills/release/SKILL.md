---
name: release
description: Release todu packages with Changesets or create desktop/binary GitHub releases. Use when user says "release todu", "create a release", "new version", "bump version", "ship it", "cut a release", or similar.
---

# Release todu

Todu has two release paths:

1. **NPM package releases** use Changesets and independent package versions.
2. **Desktop/standalone binary GitHub releases** use the tag-based `Release` workflow.

Prefer the Changesets npm flow when the user wants to publish packages like `@todu/tui`, `@todu/cli`, `@todu/core`, `@todu/engine`, `@todu/daemon`, or `@todu/recurring-worker`.

## NPM package release flow

### 1. Pre-flight

Verify readiness and stop if any check fails:

```bash
git branch --show-current          # normally main, unless adding a changeset in a feature branch
git status --short                 # must be clean unless intentionally adding a changeset
git fetch origin main
npm run check:ci
npm test
make version-check
```

### 2. Add a changeset in feature PRs

If the current PR changes an npm package and does not already include a changeset:

```bash
npm run changeset
```

Select only changed packages. For a TUI-only change, select only `@todu/tui`.

Choose semantic bumps:

- `patch` for fixes and small internal changes.
- `minor` for backwards-compatible features.
- `major` for breaking changes.

Commit the generated `.changeset/*.md` file with the PR.

### 3. Version PR

After changesets land on `main`, the `NPM Release` workflow opens or updates a Changesets version PR. That PR runs:

```bash
npm run version-packages
```

It bumps only packages named by changesets, updates changelogs, regenerates package version sources, and updates `package-lock.json`.

Review and merge the version PR when ready to publish.

### 4. Publish

When the version PR lands on `main`, the `NPM Release` workflow runs:

```bash
npm run release-packages
```

This builds the workspace and runs `changeset publish`, which publishes only package versions not already on npm.

## Desktop/binary GitHub release flow

Use this path only when the user explicitly wants desktop installers or standalone CLI binaries from a `v*` GitHub release tag.

1. Ensure `main` is clean and up to date.
2. Update `CHANGELOG.md` for the desktop/binary release.
3. Create and push a `vX.Y.Z` tag through the approved project release process.
4. The `Release` workflow builds desktop installers and standalone CLI binaries.

The tag-based `Release` workflow no longer publishes npm packages; npm publishing is owned by Changesets.

## Important

- Never force push or use `--force` flags.
- Never publish without user approval.
- For package releases, do not bump unchanged packages manually.
- If anything fails, stop and report; do not retry blindly.

See `docs/release.md` for full details.
