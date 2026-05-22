# Dependency Maintenance

This document defines how to keep todu dependencies current without creating unnecessary PR churn.

## Current repo state

The repository currently uses npm workspaces declared in the root `package.json`, with package manifests at the root and under `packages/*`.

The authoritative install and CI path is npm-based:

- local setup uses `npm install`
- CI uses `npm ci`
- validation runs through npm scripts and Make targets such as `make check-ci`, `make test`, `make build`, and `make pre-pr`

The repo contains both `package-lock.json` and `bun.lock`.

- `package-lock.json` is the authoritative lockfile for CI and pull request validation because GitHub Actions installs with `npm ci`.
- `bun.lock` is secondary and exists to support Bun-based CLI binary build workflows. It is not the source of truth for CI.

There was no visible Renovate or Dependabot configuration before this policy, and dependency maintenance expectations were not explicitly documented.

## Chosen automation: Dependabot

This repo uses GitHub Dependabot via `.github/dependabot.yml`.

Dependabot is the pragmatic choice here because:

- the project is hosted on GitHub and already relies on GitHub Actions
- npm workspace manifests are all reachable from the repository root
- the repo needs low-maintenance update discovery and PR creation more than deep custom automation
- the required grouping and cadence rules are supported without adding another hosted service or bot

## Update cadence and noise limits

Dependabot is configured to keep noise low while still preventing drift.

- Weekly on Monday: minor and patch npm updates, grouped by risk area
- Monthly on Monday: major npm updates, grouped by risk area
- Monthly on Monday: GitHub Actions updates
- Maximum open npm update PRs at once: 5 for weekly updates, 2 for monthly major updates
- Version strategy: `increase-if-necessary`

`increase-if-necessary` preserves existing semver ranges when possible and only edits `package.json` ranges when the current range no longer allows the update. That matches the current repo style better than aggressively widening ranges.

## Grouping and risk profiles

Dependabot groups updates into a small number of reviewable PRs.

### Low-risk tooling and test dependencies

Grouped as `tooling-and-tests` for minor and patch updates, with a separate monthly major group.

Examples:

- Biome
- TypeScript and type packages
- Vitest
- Testing Library
- Vite plugin tooling
- Husky
- jsdom
- tsx

Expected handling:

- merge when validation passes and there is no functional regression signal
- majors still deserve a monthly review because build, lint, or test behavior may change

### React and UI dependencies

Grouped as `react-ui`.

Examples:

- React
- React DOM
- TanStack React Query
- Tiptap packages
- `tiptap-markdown`

Expected handling:

- minor and patch updates can usually ride the normal validation path
- any UI regression suspicion should trigger manual Electron smoke testing before merge
- majors should be reviewed more carefully for rendering, editor, or hook API changes

### Electron and packaging dependencies

Grouped as `electron-packaging`.

Examples:

- Electron
- electron-builder
- electron-vite
- `@electron-toolkit/*`

Expected handling:

- treat as higher risk even for minor updates because packaging, preload, and desktop runtime behavior can break in ways unit tests do not fully cover
- require manual desktop smoke coverage before merge when behavior or packaging changes are plausible
- major updates should usually be merged manually and not batched with unrelated work

### Automerge, runtime, and sync dependencies

Grouped as `automerge-runtime-sync`.

Examples:

- `@automerge/*`
- `ws`
- `rrule`
- `yaml`

Expected handling:

- treat as high risk because these affect persistence, replication, protocol behavior, or core runtime behavior
- require stronger scrutiny of integration and sync-sensitive behavior
- do not merge on CI green alone if the change touches Automerge or sync infrastructure in a meaningful way

### pi-related dependencies

Grouped as `pi-packages`.

Examples:

- `@earendil-works/pi-agent-core`
- `@earendil-works/pi-ai`
- any future `@earendil-works/pi-*` package

Expected handling:

- treat as medium to high risk because these packages affect agent integrations in Electron
- require review for API compatibility and manual UI/agent smoke testing when relevant
- majors should be handled deliberately, not as routine lockfile bumps

## Validation required for dependency PRs

Every dependency update PR should use the existing repo verification path.

Minimum required checks:

- `make check-ci`
- `make test`
- `make build`

Preferred single local gate before merge:

- `make pre-pr`

If the update touches higher-risk areas, also add targeted verification as appropriate:

- Electron and packaging updates: run the Electron app locally or perform a focused smoke test
- Automerge, runtime, or sync updates: run the relevant integration or conformance coverage in addition to the default checks
- pi-related updates: exercise the affected Electron/agent path manually

## Review and merge process

Dependency PRs should be reviewed with the same discipline as feature work, but the review depth should match update risk.

### Routine minor and patch updates

For grouped low-risk updates:

1. Read the PR summary and changed manifests.
2. Run `make pre-pr` locally when needed or rely on equivalent CI plus any targeted follow-up checks.
3. Merge when validation passes and there are no release-note or behavior concerns.

### Higher-risk updates

For Electron, Automerge/runtime/sync, pi packages, or any major update:

1. Read upstream release notes or changelogs.
2. Run the standard validation path.
3. Run targeted manual or integration checks for the affected surface.
4. Merge only after the risk-specific checks pass.

## Lockfile policy

### Authoritative lockfile

`package-lock.json` is authoritative for dependency update PRs and CI.

Reasons:

- GitHub Actions installs with `npm ci`
- local validation and Make targets are npm-based
- workspace dependency resolution for normal development is npm-based

### Role of `bun.lock`

`bun.lock` should be treated as supporting metadata for Bun-powered CLI binary build workflows, not as the primary dependency control plane.

Practical rule:

- if a dependency update changes npm resolution, ensure `package-lock.json` is updated correctly
- keep `bun.lock` in sync when the change affects Bun-based build workflows or when Bun regenerates it as part of the update process
- if the two lockfiles diverge, CI correctness follows `package-lock.json`, but the discrepancy should still be resolved before merge

## Manual maintenance and drift checks

Automation opens PRs, but maintainers should still have a lightweight way to inspect drift.

Use:

```bash
make deps-outdated
```

This is an informational command and may return a non-zero exit code when updates are available.

Suggested cadence:

- let Dependabot handle normal discovery
- use `make deps-outdated` when investigating stale packages, noisy update patterns, or release preparation

## What to do when an update breaks

If a dependency update PR breaks validation or behavior:

1. Do not merge on a flaky green rerun without understanding the failure.
2. Check release notes and the exact packages changed inside the group.
3. If the failing PR contains multiple packages, reduce scope by editing the branch or closing the PR and letting Dependabot re-open smaller follow-up updates later.
4. For high-risk packages, create or keep a dedicated manual branch if investigation or code changes are required.
5. Document the reason for deferring or pinning an update in the PR conversation.

Good fallback options:

- close the PR and wait for a future patch release
- pin or constrain the affected package deliberately in `package.json`
- split a grouped update into a manual one-off upgrade when debugging needs isolation

## When to handle updates manually

Some updates should not be treated as routine bot merges.

Handle these manually when the risk is elevated:

- major Electron upgrades
- major Automerge or sync-stack upgrades
- major pi package upgrades
- any update that requires code changes beyond lockfile or manifest refreshes
- any update that changes packaging, install footprint, or runtime protocol behavior

## Repository files involved

- Automation config: `.github/dependabot.yml`
- Policy document: `docs/dependency-maintenance.md`
- Manual drift check entry point: `make deps-outdated`
