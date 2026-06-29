---
name: release
description: Release todu packages with Changesets or create desktop/binary GitHub releases. Use when user says "release todu", "create a release", "new version", "bump version", "ship it", "cut a release", or similar.
---

# Release todu

Todu has two release paths:

1. **NPM package releases** use Changesets and independent package versions.
2. **Desktop/standalone binary GitHub releases** use the tag-based `Release` workflow.

Prefer the Changesets npm flow when the user wants to publish packages like `@todu/tui`, `@todu/cli`, `@todu/core`, `@todu/engine`, or `@todu/daemon`. The assistant owns Changesets details; do not make the user choose packages unless the inferred scope is ambiguous or risky.

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

### 2. Infer and add changesets

If the current PR changes a published npm package and does not already include a changeset, infer the package list and create the changeset yourself:

```bash
npm run changeset:infer -- --bump patch --summary "Release updated package."
```

Rules:

- Use `patch` for fixes, small UI changes, docs shipped with a package, and internal implementation changes.
- Use `minor` for new backwards-compatible user-facing features.
- Use `major` only for intentional breaking API or CLI behavior changes, and ask first.
- If multiple published packages changed, include all changed published packages.
- If a core/engine change requires dependent package changes, include the affected dependents too.
- Skip private or ignored workspaces such as `@todu/electron` and `@todu/recurring-worker`.
- If the helper output is clearly wrong, edit the generated `.changeset/*.md` before committing.
- Ask the user only when package impact or bump level is genuinely ambiguous.

Commit the generated `.changeset/*.md` file with the PR. Do not tell the user they need to understand or run Changesets manually.

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
- For package releases, infer and add the needed changeset; do not ask the user to manage Changesets details.
- Do not bump unchanged packages manually.
- If anything fails, stop and report; do not retry blindly.

See `docs/release.md` for full details.
