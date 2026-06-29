# Release Process

Todu uses two release paths:

1. **NPM package releases** use Changesets and independent package versions.
2. **Desktop/standalone binary GitHub releases** use the existing tag-based release workflow.

## NPM package releases with Changesets

Use Changesets for published npm packages such as `@todu/core`, `@todu/engine`, `@todu/daemon`, `@todu/cli`, and `@todu/tui`.

### Add a changeset in feature PRs

When a PR should publish an npm package, the release flow should infer and add the changeset. Humans should not need to know Changesets details for normal work.

```bash
npm run changeset:infer -- --bump patch --summary "Release updated package."
```

The helper detects changed published workspace packages and skips private/ignored workspaces. For example, a TUI-only change creates a changeset for only `@todu/tui`.

Choose the semantic bump for each selected package:

- `patch` for fixes and small internal changes.
- `minor` for new backwards-compatible functionality.
- `major` for breaking changes.

If the inferred package list or bump is wrong, adjust it before committing. Commit the generated `.changeset/*.md` file with the PR.

### Version PR

After changes with changesets land on `main`, the `NPM Release` workflow opens or updates a Changesets version PR. That PR:

- bumps only packages named by changesets,
- updates package changelogs,
- updates generated version sources for packages that use them,
- updates `package-lock.json`.

Review and merge the version PR when ready to publish.

### Publish

When the version PR lands on `main`, the `NPM Release` workflow runs `npm run release-packages`, which builds the workspace and publishes only packages with versions that are not already on npm.

## Ignored workspaces

`@todu/electron` and `@todu/recurring-worker` are ignored by Changesets. Add them back to the Changesets publish set only when they have an intentional npm release path.

## Internal workspace dependencies

Current Todu packages use workspace-local `@todu/*` dependencies with `"*"` ranges. Changesets can publish a package independently when only that package changes.

When a package makes an incompatible change that affects dependents, add changesets for the dependents too. For example, if `@todu/core` changes in a way that requires CLI updates, include changesets for both `@todu/core` and `@todu/cli`.

`updateInternalDependencies` is configured as `patch`, but `"*"` ranges are intentionally broad. Human package selection in each changeset is the compatibility gate.

## Generated version sources

`@todu/cli` and `@todu/tui` compile their package version into `src/version.ts`. After Changesets updates package versions, run:

```bash
node scripts/generate-package-versions.mjs
```

The `version-packages` script runs this automatically. Verify generated sources with:

```bash
make version-check
```

## Desktop and binary releases

The existing `Release` workflow still creates GitHub releases for desktop installers and standalone CLI binaries from `v*` tags. It no longer publishes npm packages. NPM publishing is owned by the Changesets workflow.
