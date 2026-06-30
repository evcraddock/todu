# Release Process

Todu uses two release paths:

1. **NPM package releases** use Changesets and independent package versions.
2. **Desktop/standalone binary GitHub releases** use the existing tag-based release workflow.

## NPM package releases with Changesets

Use Changesets for published npm packages such as `@todu/core`, `@todu/engine`, `@todu/daemon`, `@todu/cli`, and `@todu/tui`.

### Release command infers and versions locally

For normal package releases, say "release" and let the assistant infer the Changesets details. Release preparation happens locally, not in CI.

The assistant should:

1. infer whether any published packages need release changesets,
2. create or confirm the needed `.changeset/*.md` files,
3. run local versioning,
4. open a normal PR containing the version/changelog/lockfile/generated-version changes.

Commands behind that flow:

```bash
npm run release -- --bump patch --summary "Release updated package."
npm run version-packages
```

The helper detects changed published workspace packages and skips private/ignored workspaces. For example, a TUI-only change creates a changeset for only `@todu/tui`.

Default bump selection:

- `patch` for fixes and small internal changes.
- `minor` for new backwards-compatible functionality.
- `major` for breaking changes.

If the inferred package list or bump is wrong, the assistant adjusts it before running `npm run version-packages`.

### Version PR

The assistant creates the version PR locally. That PR:

- bumps only packages named by changesets,
- updates package changelogs,
- removes consumed `.changeset/*.md` files,
- updates generated version sources for packages that use them,
- updates `package-lock.json`.

Review and merge the version PR when ready to publish.

### Publish

When the locally-created version PR lands on `main`, the `NPM Release` workflow runs `npm run release-packages`, which builds the workspace and publishes only packages with versions that are not already on npm. CI must not create or update release PRs.

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
