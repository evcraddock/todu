# Dependency security remediation: task-763357bb

## Status

**UUID exception approved by the maintainer:** "its ok leave 9.0.1". Retain UUID 9.0.1 and stable Repo 2.5.6; accept only GHSA-w5hq-g745-h8pq and its three inherited Repo/adapter findings based on the reachability evidence below. This does not approve other findings, audit suppression, prerelease adoption, Node support changes, merge, or publication. The upgrades are implemented in an isolated worktree; the pending release worktree is unchanged.

On October 5, 2026, `npm audit --json` reported 57 affected-package findings: 3 critical, 43 high, 9 moderate, and 2 low. Following the approved upgrades and targeted compatible transitive updates, a clean `npm ci` and a fresh audit report 4 moderate findings, all stemming from one UUID advisory. Counts include inherited package findings and are not counts of distinct advisories.

Evidence:

- [Baseline audit](task-763357bb-audit-before.json): advisory URLs, affected ranges, installed dependency locations, and npm's proposed fixes.
- [Post-update audit](task-763357bb-audit-after.json): the remaining UUID and Repo findings, without suppressions.
- [Complete inventory](task-763357bb-audit-inventory.json): all 57 baseline findings, before/after versions, advisory details, inherited findings, dependency paths from workspace manifests, exposure categories, remediation options, and current disposition. Paths are representative paths per workspace/dependency category, not an exhaustive enumeration of every possible graph traversal. Development dependencies of transitive packages are not counted as installed runtime edges.

## Upgrades and compatibility

| Direct dependency | Before | After | Rationale |
| --- | --- | --- | --- |
| Automerge core | 3.3.2 | 3.5.0 | Latest stable registry release when checked; exact matching pins in root, engine, and daemon avoid divergent runtimes. Repo remains stable 2.5.6. |
| Changesets CLI | 2.31.0 | 3.0.3 | Explicitly approved major upgrade removes vulnerable braces/micromatch/globby chains. Node 24 and the existing npm CLI satisfy its development-tool requirements. |
| Electron | 40.4.1 | 41.10.7 | Explicitly approved major upgrade fixes desktop security advisories and replaces vulnerable extract-zip. Both root and desktop dependency floors are updated. |
| electron-builder | 26.7.0 | 26.15.3 | Same-major update includes AppImage search-path and credential-redirect fixes; updates packaging dependencies. |
| Vitest and coverage | 4.0.18 | 4.1.11 | Same-major matched versions fix the UI-server and mocker file-read/execution advisories. |
| Vite | 7.3.1 | 7.3.6 | Same-major update fixes development-server file-read and deny-list bypass advisories. |
| Tiptap family | 3.19.0 | 3.31.4 | Coordinated exact pins fix prototype-derived DOM attributes and Markdown parsing denial of service. |
| tsx | 4.21.0 | 4.23.15 | Same-major update permits fixed esbuild 0.28.x; retaining the old tsx esbuild range left a low-severity finding. |
| engine ws | 8.19.0 | 8.22.0 | Same-major minimum dependency floor includes memory-disclosure and fragmented-message denial-of-service fixes in new consumer installations, not only this lockfile. |

Targeted compatible lockfile refreshes cover Babel, xmldom, ajv, browser mapping, brace expansion, Browserslist, esbuild, form-data, HTTP cache semantics, IP address parsing, js-yaml, linkify-it, lodash, markdown-it, minimatch, nanoid, picomatch, PostCSS, protobufjs, Rollup, tar, tmp, undici, and ws. The inventory records versions removed by parent upgrades separately from surviving versions. For example, electron-builder's new graph removes the vulnerable ajv 6 path; ajv 8 is not an override forced onto an ajv 6 consumer.

No `npm audit fix --force`, overrides, suppressed advisories, or public workspace version bumps were applied. Existing Automerge install patches remain unchanged and apply successfully, including the idempotent second invocation. The new changeset selects engine and daemon for the next normal release without consuming any existing changeset. No versioning or publishing command was run.

## Exposure assessment

- **Published engine/daemon/CLI runtime:** ws handles network traffic; NodeFS storage brings glob/minimatch/brace-expansion; Repo brings UUID. These findings are not development-only. Updated manifest floors protect fresh downstream dependency resolution where possible.
- **Private desktop workspace, shipped runtime:** Electron is declared as a development dependency but its executable is shipped inside desktop releases. Tiptap and Markdown parser dependencies process task descriptions/notes, including imported content. Agent-runtime protobuf dependencies are also runtime dependencies. Private workspace status is not a reason to dismiss these vulnerabilities.
- **Development servers and tests:** Vitest, Vite, and mocker vulnerabilities can expose files or execute code when a server is accessible. They were upgraded rather than waived based on current server configuration.
- **Build, install, packaging, and release supply chain:** tar/extract-zip, XML parsing, credential redirects, source-map loading, glob handling, and temporary paths can affect workstations and CI when handling dependencies, archives, repository content, or publishing inputs. Their critical/high findings were addressed despite development-dependency classification. The complete inventory identifies shared runtime paths where present.

## Approved UUID exception and alternatives

The remaining advisory is [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq): UUID before 11.1.1 lacks buffer bounds checks in v3/v5/v6 when a caller supplies a buffer. The installed version is 9.0.1. Npm reports moderate severity and also propagates it to Repo, its WebSocket adapter, and its NodeFS storage adapter.

Stable Repo 2.5.6 requires `uuid: ^9.0.0`. Registry version enumeration confirms it is the latest non-prerelease Repo version. The `latest` tag instead points to `2.6.0-alpha.3`, which uses UUID 14 and requires Node >=22.13. Adopting it would violate the stable-only boundary and raise the currently declared Node >=20 runtime requirement; it is not authorized by the approved core-library upgrade.

Source inspection finds Repo calls `v4`, `validate`, and `parse`, not the affected v3/v5/v6 functions. Its buffered v4 call uses a freshly allocated 16-byte array. This narrows current reachability but does **not** remove the installed vulnerable code. After reviewing this evidence, the maintainer explicitly approved leaving UUID 9.0.1 unchanged. The four moderate audit findings remain visible and are accepted, not described as remediated.

Alternatives considered:

1. **Root-only UUID override:** rejected as a complete fix. UUID 11 is outside Repo's declared range, and workspace root overrides would not protect users installing published Todu packages. No override was added.
2. **Prerelease Repo upgrade:** not applied. Requires separate approval for the stability-policy and Node-support changes, plus revalidation of Repo APIs and every installation patch.
3. **Stable backport or supported fork:** requires a separate concrete implementation/review decision. Any solution must reach downstream installations, preserve current Node support, cover the affected UUID APIs with regression tests, and transparently disclose any remaining registry audit findings. Patching source without changing registry metadata must not be presented as a clean audit.
4. **Explicitly approved, narrowly documented exception:** selected by the maintainer. Keep UUID 9.0.1 without an override, fork, backport, or change to Repo. Scope the exception to GHSA-w5hq-g745-h8pq and its inherited findings; it is not a waiver for arbitrary moderate vulnerabilities.

**Upstream follow-up:** Recheck stable Repo and UUID compatibility at the next dependency review and when a stable Repo with a fixed UUID dependency becomes available. Reassess the exception immediately if runtime dependency paths begin calling the affected UUID functions or advisory exposure changes. A future stable upgrade still requires installation-patch and storage/sync regression verification. Npm audit is expected to exit nonzero with these four moderate findings; retain its report rather than suppressing them. Task closure, merge, and publication still require their separate workflow gates.

## Verification so far

- Clean `npm ci`: passed; existing engine/root postinstall patches succeeded.
- Final `make check`, `make pre-pr`, and `git diff --check`: passed; **926 unit tests** passed.
- Default full suite with isolated HOME: **1472 passed, 14 conditional skips, zero failures**, including a snapshot saved by Automerge 3.3.2 and concurrent-edit/save/load compatibility regressions, plus imported Markdown link sanitization coverage.
- Explicit `make test-sync-server-integration` with isolated HOME: **25 passed, zero skips/failures**. This executes the fourteen cases skipped by the default suite. A trace-enabled repeat also passed all 25 tests.
- Node **20.20.2**: **14 targeted tests** passed for legacy Automerge snapshots, storage shutdown/reopening, and sync pull checkpoint persistence. Public runtime support remains Node >=20.
- Electron production build and bundled daemon: passed. Electron 41.10.7 binary preparation and executable smoke check passed (embedded Node 24.18.0). Isolated native-Wayland desktop/CDP smoke testing passed: the seeded Projects view and Tasks view rendered correctly, screenshots were verified, and no renderer errors were captured. A fresh HOME/config/storage/socket and a credential-free environment kept real data, plugins, and daemon configuration untouched. The initial headless-Ozone harness launch exited with SIGSEGV; headless desktop operation is not claimed to pass. The native desktop launch required no sandbox bypass or permission changes.
- Changesets 3 status/JSON release-plan generation, release inference dry-run, and `make version-check`: passed. No changesets were consumed.
- No unhandled rejection, missing-storage-file race, or failing assertion was found in these runs.

The opt-in sync runs emitted `TimeoutNegativeWarning`. Trace evidence locates it in unchanged Repo 2.5.6 `dist/helpers/throttle.js`: `lastCall + delay - Date.now()` can become negative before being passed to `setTimeout`. Node clamps the delay to one millisecond. This is disclosed, not suppressed; a warning-free run is not claimed. Any additional Repo workaround must be scoped and reviewed alongside the UUID decision.

## Release coordination

The original `chore/task-89290c32-npm-release` worktree retains its uncommitted versions, changelogs, generated version sources, and lockfile. Both its Git status and tracked binary diff were compared with saved pre-work snapshots and remain unchanged. After security changes merge, release preparation must reconcile the new dependency graph with those pending version-only changes without repeating successful versioning or overwriting release metadata. That reconciliation and publication are not performed by this task.
