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

When the user says "release", do all release preparation locally. Do not ask the user to manage Changesets. CI must publish only; it must not create or update release PRs.

### 1. Inspect changed packages and create changesets locally

Fetch the release base and run the inference helper:

```bash
git fetch origin main
npm run release -- --bump patch --summary "Release updated package."
```

The helper checks what changed and creates the needed changeset:

- On feature branches, it compares the branch with `origin/main` plus working tree changes.
- On `main`, it compares each package with the commit where that package's current version was set, so it can still find package changes that landed without a changeset.
- It skips private or ignored workspaces such as `@todu/electron` and `@todu/recurring-worker`.

### 2. Pick the bump yourself

Default to `patch` unless evidence says otherwise:

- `patch` for fixes, small UI changes, docs shipped with a package, and internal implementation changes.
- `minor` for new backwards-compatible user-facing features.
- `major` only for intentional breaking API or CLI behavior changes; ask before using it.

If multiple published packages changed, include all changed published packages. If a core/engine change requires dependent package changes, include the affected dependents too. If the helper output is clearly wrong, edit the generated `.changeset/*.md` before versioning.

Ask the user only when package impact, bump level, or publish timing is genuinely ambiguous.

### 3. Version locally

Run versioning locally after the changesets are correct:

```bash
npm run version-packages
```

This bumps only packages named by changesets, updates changelogs, removes consumed `.changeset/*.md` files, regenerates package version sources, and updates `package-lock.json`.

### 4. Verify and open a normal PR

After local versioning:

```bash
npm run check:ci
npm test
make version-check
```

Commit the versioned package files, changelogs, generated version sources, lockfile, and consumed changeset removals. Open a normal PR for human review/merge. Do not rely on CI to create this PR.

### 5. Publish

When the locally-created version PR lands on `main`, the `NPM Release` workflow runs:

```bash
npm run release-packages
```

This builds the workspace and runs `changeset publish`, which publishes only package versions not already on npm. CI should fail or skip if unconsumed `.changeset/*.md` files are present on `main` because that means local versioning was skipped.

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
