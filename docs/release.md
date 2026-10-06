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

The `Release` workflow creates GitHub releases for Linux desktop installers (x64 AppImage/deb), macOS desktop installers (x64/arm64 DMG), and standalone CLI binaries from `v*` tags. Windows receives a standalone CLI binary only; no Windows desktop installer is published by this workflow. NPM publication remains owned by Changesets.

### Prepare locally; publish only after approval

1. Update the private root and `@todu/electron` versions together and add the desktop changelog section. Leave published npm package versions independent; do not run Changesets versioning for a desktop-only release.
2. Run `node scripts/validate-desktop-release.mjs vX.Y.Z`. The tag must exactly match the checked-out desktop/root metadata. Manual dispatch checks out the requested tag, then all build/release jobs use the same validated commit.
3. Run `make pre-pr`, build the platform/architecture CLI binaries, and build Electron. `make dist-linux` and `make dist-mac` validate unpacked native runtime contents and bundled-daemon lifecycle before creating installers.
4. Review and merge the source/version PR through the normal human approval gate. A merge does not publish desktop artifacts.
5. Only with explicit desktop publication approval, create/push the tag or dispatch the release workflow. Do not change signing/authentication/security settings as part of recovery.
6. Verify the release assets, `SHA256SUMS.txt`, `desktop-versions.json`, actual Electron runtime, core/engine/daemon bundle contents, and architecture-matching CLI. Installer helpers verify the named asset's SHA-256 digest before replacing installed files. Linux AppImages use `linux-x86_64.AppImage`, matching electron-builder's architecture naming. Installation and live daemon verification require separate approval; publishing alone does not update installed desktop software.

### Runtime and bundle validation

The exact Electron dependency in `packages/electron/package.json` is authoritative. There is no separate `electronVersion` packager override or duplicate root Electron dependency. Electron-builder resolves the installed pinned dependency. `dist/desktop-runtime.json` records the workspace/component versions; the packaged validator checks them against source and checks the executable's actual Electron version.

The packager selects the standalone CLI for the target architecture, including separate x64/arm64 macOS binaries. Npm CLI/TUI versions need not equal the desktop tag: for desktop 0.23.3, the companion CLI is 0.24.2 and TUI is 0.26.1. The bundled daemon is 0.24.1; updating the npm CLI does not replace an installed desktop's fallback daemon.

`validate:daemon-bundle:linux` and `validate:daemon-bundle:mac` inspect fresh candidate contents, compare repaired daemon modules with the tested build, verify the Repo timer repair, and reject affected packaging-tool code in shipped runtime contents. They create temporary HOME/config/storage/socket paths, clear inherited Todu overrides, and disable sync/plugins/workers. An RPC handshake, accepted mutation, subscribed-client graceful shutdown, and reopened catalog/project persistence are required. Forced termination, nonzero exit, leftover sockets, and race/failure signatures fail validation rather than certify storage completion.

Normal candidate CI validates native unpacked Linux x64 and macOS x64/arm64 packages without publishing. These Node-mode daemon probes are not GUI/headless-GUI tests. Native graphical smoke coverage is recorded separately, with unverified platforms disclosed. Do not add sandbox-disable flags or change sandbox configuration to make a graphical check pass. The pre-existing renderer `sandbox: false` setting and unsigned macOS/hardened-runtime settings are unchanged by this task; successful smoke coverage is not a claim of renderer sandboxing or code-signing assurance.

### Scoped dependency exceptions

For task `task-a52e2803`, the maintainer separately approved **sprintf-js 1.1.3 / GHSA-hp3w-g68c-fv3c and inherited affected-package findings**, limited to controlled desktop packaging tooling and conditional on verification that affected code is absent from shipped runtime contents. The build path is electron-builder → app-builder-lib → @electron/get 3 → optional global-agent 3 → roarr 2 → sprintf-js. No compatible patched sprintf-js or supported parent update removing this path was available during assessment; changing proxy/downloader majors through overrides or downgrading the builder is not approved.

The fresh baseline has 12 moderate affected-package findings from two advisories: eight sprintf-derived entries and four UUID-derived entries. This is not a clean audit. The existing UUID 9.0.1 exception remains narrow and separate; see [dependency audit](security/task-763357bb-dependency-audit.md). Dev/optional status is not itself a waiver. Reassess exposure and stop for a new decision if candidate contents, advisory scope, or reachability change; neither exception is a general future waiver.
