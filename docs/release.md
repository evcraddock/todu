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

### Authentication: npm trusted publishing

The `release` job uses GitHub OIDC (`id-token: write`) instead of a long-lived npm token. Its existing Node 24 runtime supplies an npm CLI compatible with trusted publishing; npm requires version 11.5.1 or later and Node 22.14.0 or later. Keep publishing on GitHub-hosted runners. Changesets delegates publication to `npm publish`, which exchanges the job's OIDC identity for short-lived package publishing credentials. Public package releases from this public repository also receive npm provenance automatically.

Configure a trusted publisher separately in the npm package settings for each published workspace: `@todu/core`, `@todu/engine`, `@todu/daemon`, `@todu/cli`, and `@todu/tui`. Select **GitHub Actions** and enter:

| Field | Value |
|-------|-------|
| Organization or user | `evcraddock` |
| Repository | `todu` |
| Workflow filename | `npm-release.yml` (filename only) |
| Environment name | Leave blank; the release job has no GitHub environment |
| Allow npm publish | Enabled; Changesets publishes directly |
| Allow npm dist-tag | Disabled; the workflow does not manage tags separately |

Do not configure ignored/private workspaces or unrelated repositories. Each published package's `repository.url` must match `https://github.com/evcraddock/todu.git`. npm does not validate the connection when it is saved, so a successful release is the final authentication check. Any npm login or security-key confirmation must be completed by the maintainer, not shared with an agent.

The workflow no longer reads `NPM_TOKEN` or `NODE_AUTH_TOKEN` from GitHub secrets. Do not add replacement publish tokens to the repository, logs, task comments, or PRs. Leave existing package publishing restrictions unchanged during migration. After successful OIDC publication, maintainers can separately approve restricting token publishing, revoking unused npm tokens, and deleting the obsolete GitHub secret.

### Authentication failure and recovery

The October 4, 2026 release run [37224109693](https://github.com/evcraddock/todu/actions/runs/37224109693) built successfully but npm rejected `@todu/cli@0.24.1` and `@todu/daemon@0.23.3` with permission-related `E404` errors. Both Todu CI tokens listed in the npm account had expired on September 27, 2026. GitHub's `NPM_TOKEN` secret had last been updated on June 30, and the workflow depended entirely on that secret without OIDC permissions. This identifies expired CI publishing credentials as the recovery target; an `E404` alone would not distinguish expiration from missing package permissions. Only token status, dates, and secret metadata were inspected, never credential values. Both packages already allowed granular tokens with 2FA bypass, so weakening their restrictions was not necessary.

To recover a failed release:

1. Verify the npm trusted-publisher connection on every package that needs publication. Check the owner, repository, workflow filename, direct-publish permission, and environment against the release job exactly.
2. Verify the workflow has `id-token: write`, a supported npm CLI, and a GitHub-hosted runner. Do not use `npm whoami` to test OIDC: trusted publishing authenticates `npm publish`, not account/profile commands.
3. Review and merge the authentication fix only with explicit merge **and publication** approval: pushing to `main` automatically starts the NPM Release workflow. Do not rerun the old failed commit, which still uses the expired token configuration.
4. If a manual retry is needed, obtain publication approval and dispatch the current workflow on `main`:

   ```bash
   gh workflow run npm-release.yml --ref main
   gh run list --workflow npm-release.yml --branch main
   gh run view <run-id>
   ```

5. Changesets skips versions already present on npm. Recover the already-versioned release without another version bump, and verify exact versions using registry metadata:

   ```bash
   npm view @todu/cli@0.24.1 version dist.integrity --registry=https://registry.npmjs.org
   npm view @todu/daemon@0.23.3 version dist.integrity --registry=https://registry.npmjs.org
   ```

Record the successful workflow URL and registry results in the task handoff. A saved npm connection, successful build, or local regression test does not prove publication succeeded.

OIDC credentials need no periodic token rotation. Audit the five package connections when changing repository ownership, workflow filenames, runners, or deployment environments. A connection's provider and required identity fields cannot be changed after creation; replacing one requires an explicitly approved removal and recreation. If an OIDC release fails, compare these settings first rather than adding a broad token or weakening 2FA.

See [npm trusted-publishing documentation](https://docs.npmjs.com/trusted-publishers/) for requirements and troubleshooting.

## Ignored workspaces

`@todu/electron` and `@todu/recurring-worker` are ignored by Changesets. The existing `@todu/recurring-worker@0.1.1` npm package can be used as a pinned single-machine plugin, but it does not receive updates through the normal release workflow. A future recurring-worker update must be intentional: remove the workspace's private flag, add it back to the Changesets publish set, add an appropriate changeset, and verify npm installation and automatic occurrence generation before publishing.

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
