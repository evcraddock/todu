# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.23.1] - 2026-05-21

This release fixes comment sync reconciliation for providers that return partial or incremental comment updates. Todu now preserves existing synced comments that are omitted from a delta response and only removes local notes when the provider explicitly reports a deletion or marks a task/thread comment set as complete. It also tightens the contributor workflow so approval requests include a concrete plan first.

### Fixed
- Preserved local synced comments omitted from partial or incremental provider pulls instead of treating absence from a delta response as remote deletion (#456)
- Added explicit deletion semantics for provider comment pulls through tombstones and complete task/thread comment snapshots (#456)

### Documentation
- Updated the contributing workflow to require a concrete, task-specific plan before asking for implementation or release approval

## [0.23.0] - 2026-05-20

This release replaces tag-based comment sync bookkeeping with structured comment provenance in core. Sync providers can now identify imported and mirrored comments through first-class provenance records instead of inspecting user-visible note tags, while existing GitHub/Forgejo-style plugin behavior remains compatible during migration.

### Added
- Added core-owned structured comment sync provenance records for binding-scoped local note/comment links, including provider target context, external task/thread IDs, external comment IDs, and last mirrored timestamps (#454)
- Added provider-facing exported comment provenance so sync plugins can decide whether to skip, create, or update remote comments without `note list` tag lookups (#454)

### Changed
- Changed imported comment sync to create provenance records instead of requiring new `sync:externalId:*` user-visible note tags for loop prevention (#454)
- Added lazy compatibility migration for existing comments with legacy `sync:externalId:*` tags while preserving normal user notes unchanged (#454)

### Documentation
- Documented the comment provenance model, provider migration path, and updated integration ownership boundary (#454)

## [0.22.0] - 2026-05-19

This release improves task discovery and daemon reliability. Task search now includes descriptions, daemon startup is more stable from CLI-managed launches, legacy `todu` CLI compatibility has been removed, and remote sync can recover from a wedged adapter without restarting the daemon.

### Added
- Added task description search so task search can match content beyond titles and structured fields (#449)

### Changed
- Removed the legacy `todu` CLI alias and updated remaining environment/documentation references toward the current `todu` naming (#447)

### Fixed
- Made CLI-managed daemon startup use a stable working directory so daemon launches are less sensitive to the caller’s current shell location (#448)
- Added supported `todu sync start`, `todu sync stop`, and `todu sync restart` commands for daemon-owned remote sync control (#451)
- Added remote sync status reconciliation and watchdog recovery so stale disconnected adapter state can recover while the sync server is reachable (#451)
- Added remote sync lifecycle logging for peer, close, error, and watchdog restart events (#451)

## [0.21.1] - 2026-04-23

This release fixes a daemon RPC gap that broke single-note lookups for clients using `note.get`. The daemon now exposes a first-class note detail endpoint with the expected not-found behavior, and the client-facing surfaces in this repo are aligned with that contract.

### Fixed
- Added first-class daemon RPC support for `note.get` so clients can fetch a single note by ID instead of failing with `METHOD_NOT_FOUND` (#445)
- Returned proper `NOT_FOUND` errors for missing notes and added regression coverage across engine, daemon RPC, and Electron-facing client layers (#445)
- Updated local daemon-backed client and renderer type surfaces so note detail lookups stay aligned with the new RPC contract (#445)

## [0.21.0] - 2026-04-23

This release closes the sync-provider rollout compatibility window. todu now supports the final v3-only plugin contract, removes deprecated v2 host/runtime paths, and updates the canonical docs to match the supported boundary.

### Changed
- Removed legacy sync-provider API v2 support from core and daemon so supported sync plugins now target a single v3-only host/runtime contract (#443)
- Removed obsolete internal compatibility helpers and transition-only sync-provider documentation from the rollout period (#443)

## [0.20.0] - 2026-04-21

This release improves first-run setup and installation polish. New users now get an interactive `todu config init` flow for bootstrap identity and optional sync setup, while desktop and CLI install paths are more robust across packaged builds, npm installs, and release tooling.

### Added
- Added an interactive `todu config init` flow that collects owner identity and optional remote sync configuration during project-local setup (#441)
- Added desktop installer helper scripts and copy-paste install flows for Linux and macOS users (#436)
- Added bundled desktop runtime validation and Electron-managed daemon lifecycle support for packaged installs (#424, #425, #426)
- Added clearer CLI companion install guidance and install-flow validation for desktop users (#427, #428)

### Changed
- Clarified README install guidance so installer script URLs remain stable across releases (#437)

### Fixed
- Fixed release workflow changelog extraction so automated releases parse changelog content correctly (#429)
- Fixed packaged daemon validation across platform-specific release layouts (#430)
- Fixed Windows release packaging to ship only the supported CLI path instead of a broken desktop bundle (#431)
- Fixed npm global CLI installs by publishing the daemon package and supporting symlink launcher re-exec paths (#433, #439)

## [0.19.0] - 2026-04-21

This release finishes the desktop-first install flow for todu and stabilizes the release pipeline around that distribution model. Desktop builds now bundle and validate the daemon more robustly, Linux and macOS users get copy-pasteable installer flows, and npm-installed CLI users get a fix for daemon startup through standard global symlink launchers.

### Added
- Bundled the local daemon into Electron desktop distributions so packaged installs no longer require separate daemon setup (#424)
- Added Electron-managed daemon lifecycle handling for packaged desktop builds (#425)
- Added release-time validation for bundled desktop runtime packaging (#426)
- Added documented CLI companion install guidance for desktop users (#427)
- Added Linux and macOS desktop installer helper scripts with README copy-paste install flows (#436)

### Changed
- Added explicit desktop-facing guidance for protocol mismatch and compatibility failures in packaged Electron apps (#428)
- Expanded bundled-daemon release validation across Linux and macOS release builds and clarified Windows desktop limitations (#428, #430, #431)
- Clarified README install guidance so helper-script installs use stable script URLs and versioned installs keep working even for older release assets (#437)

### Fixed
- Repaired release workflow changelog extraction so the GitHub Actions release workflow parses correctly (#429)
- Fixed packaged-daemon bundle validation across platform-specific release layouts (#430)
- Published `@todu/daemon` as part of the npm release flow so `npm install -g @todu/cli` succeeds (#433)
- Fixed CLI daemon direct-mode self-reexec so npm global symlink launchers like `todu` work without requiring a `.js` suffix (#439)
- Limited Windows releases to the supported CLI path instead of shipping a broken desktop bundle (#431)

## [0.18.0] - 2026-04-20

This release makes todu much easier to install and use as a desktop app. The desktop builds now bundle and manage the local daemon, the CLI is documented as an optional power-user companion, and release validation now checks the bundled runtime across platforms.

### Added
- Bundled the local daemon into Electron desktop distributions so packaged installs no longer require a separate daemon setup (#424)
- Added Electron-managed daemon startup and reconnect handling for packaged desktop builds (#425)
- Added release-time validation for bundled desktop runtime packaging and startup compatibility (#426)
- Added documented CLI companion install flow with matching-version guidance for desktop users (#427)

### Changed
- Clarified desktop-first installation guidance and repositioned source builds as a development workflow (#426, #427)
- Added explicit packaged-app guidance for daemon protocol mismatch and compatibility failures (#428)
- Expanded bundled-daemon release validation coverage across Linux, macOS, and Windows workflows (#428)

## [0.17.2] - 2026-04-19

This release focuses on sync and storage reliability. It improves assignee conflict handling and makes join/storage migration behavior safer and easier to debug.

### Fixed
- Handle v3 assignee sync conflicts more reliably (#417)
- Validate join targets using the real repo and remote sync setup when configured
- Improve catalog load errors with stage-specific failure details
- Avoid shared default object references during catalog migration
- Repair canonical actor references with safer in-place actor removal

## [0.17.1] - 2026-04-18

Improves sync and actor migration reliability by fixing stale assignee conflict handling and canonicalizing duplicate legacy actor references.

### Fixed
- Fixed v3 sync freshness handling so newer remote assignee removals can be imported into todu instead of being overwritten by stale local state.
- Added `updatedAt` to the v3 exported task payload so sync providers can safely compare local and remote freshness before pushing assignee changes.
- Fixed legacy actor canonicalization so duplicate migrated actor references are rewritten to the canonical actor and owner-name note authors are mapped back to the owner actor.

## [0.17.0] - 2026-04-16

This release introduces the actor-based multi-user foundation across todu. Core storage now migrates legacy assignees and note authors into actor-backed identity, the sync runtime supports both legacy v2 and new v3 provider contracts during the transition window, and the CLI and Electron app now expose actor, authorization, assignee, and approval workflows needed for multi-user task management.

### Added
- Added the actor-based assignment model in core storage, including catalog actors, owner actor identity, project authorized assignees, and imported-content approval metadata (#392, #395)
- Added sync-provider API v3 and actor-aware runtime compatibility shims so new core can work with both v2 and v3 plugins during rollout (#396, #397)
- Added CLI support for actor management, owner actor management, project authorized-assignee management, and explicit approval commands (#406, #407, #408, #409)
- Added Electron UI for actor management, project authorization, task assignee management, and approval actions in task and comment flows (#410, #411, #412)
- Added `identity.ownerActor` bootstrap config so fresh catalogs and first-time actor migration can use a configured owner actor ID and display name instead of the default `actor-user` / `user` (#414)

### Changed
- Legacy task assignees and note authors now migrate to canonical actor IDs on startup, with actor-based storage treated as the source of truth after migration (#394)
- Core rollout docs and implementation now define a compatibility window where existing v2 sync plugins can continue working while GitHub and Forgejo plugin upgrades move to API v3 (#393, #396, #397)

### Fixed
- Fixed Electron approval actions to send the correct daemon RPC parameter names so approve buttons work in the running app (#412)
- Stabilized the release workflow by pinning and passing the Bun version correctly in GitHub Actions (#383, #384)

## [0.16.1] - 2026-04-11

This release improves dependency maintenance and updates the Electron app’s pi integration to the latest supported library versions.

### Changed
- Added a documented dependency maintenance policy and low-noise Dependabot configuration for grouped npm and GitHub Actions updates (#380)
- Added a manual `make deps-outdated` workflow for checking dependency drift outside automated PRs (#380)
- Upgraded Electron’s pi integration libraries to the latest supported npm versions and aligned OAuth imports with the current pi package export surface (#382)

### Fixed
- Updated the Electron pi OAuth integration to use the current `@mariozechner/pi-ai/oauth` entry point and match current upstream Anthropic OAuth provider behavior (#382)

## [0.16.0] - 2026-04-01

Replace completion-date filtering with updated-at range filtering for reliable reporting across all tasks.

### Changed
- Task list filtering now uses `updatedFrom`/`updatedTo` instead of `completedFrom`/`completedTo`, querying the existing `updatedAt` timestamp which is available on all tasks including historical data
- CLI flags changed from `--completed-from`/`--completed-to` to `--updated-from`/`--updated-to`
- Monthly review workflow: use `--status done --updated-from/--updated-to` to find tasks completed in a date range

### Removed
- `completedAt` field on tasks (replaced by filtering on `updatedAt`)
- `completedFrom`/`completedTo` filter fields (replaced by `updatedFrom`/`updatedTo`)

## [0.15.0] - 2026-04-01

Completion-date filtering for task lists, enabling monthly review workflows.

### Added
- Tasks now track a `completedAt` timestamp, set automatically when status transitions to `done` and cleared when reopened
- New `completedFrom`/`completedTo` filter fields on task list queries to find tasks completed within a date range
- CLI flags `--completed-from` / `--completed-to` on `todu task list`
- Electron agent tool `list_tasks` exposes completion-date filtering
- Documentation for using completion-date filters in monthly review workflows

## [0.14.2] - 2026-04-01

Timezone-aware date filtering for notes and tasks.

### Fixed
- Date range filters (`createdFrom`/`createdTo`) now accept an optional `timezone` field so day boundaries are calculated relative to the caller's timezone instead of always UTC (#372)

## [0.14.1] - 2026-03-31

Patch release fixing habit streak calculation.

### Fixed
- Habit streak no longer resets to 0 when today's check-in is pending — the current streak now reflects consecutive past days until the user actually misses a scheduled day (#369)

## [0.14.0] - 2026-03-27

This release improves the journal experience in Electron with timezone-aware weekly browsing and reduces note-related sync pressure by removing an unbounded catalog index and narrowing default journal reads.

### Added
- The Electron journal now uses the saved settings timezone for date display, shows 12-hour times with AM/PM, and loads entries one week at a time starting with the current week (#366)

### Changed
- Journal navigation now pages by week instead of month, with older/newer controls scoped to the active week (#366)
- Dev workflow startup now uses an isolated daemon socket/config so `make dev` and `make dev-electron` can run alongside a production daemon on the same machine (#366)

### Fixed
- Note-heavy sync flows no longer maintain the unbounded catalog-level `noteBucketByNoteId` index, reducing default note serialization pressure and root-catalog growth (#364)
- Journal and standalone note views no longer eagerly load unrelated note payloads by default, reducing unnecessary note reads in normal operation (#364)

## [0.13.0] - 2026-03-22

This release adds created-at date range filtering to task listing, making task history queries line up with the date-range behavior already available for notes.

### Added
- `todu task list` now supports `--from` and `--to` for filtering tasks by created-at date range (#362)

### Changed
- Task filtering now supports created-at range bounds across the shared filter model, engine, and CLI surface (#362)

### Fixed
- Task date range validation now matches note date-range behavior for accepted formats, inclusive date-only bounds, and inverted-range errors (#362)

## [0.12.0] - 2026-03-22

This release adds a native journal-only note filter so standalone journal entries can be listed directly from the CLI without mixing in task, project, or habit notes.

### Added
- `todu note list` now supports `--journal` for listing only standalone journal entries (#360)

### Changed
- Note filtering now supports a journal-only mode across the shared filter model, engine, CLI, and Electron tool surface (#360)

### Fixed
- Journal-only note queries now target only `journal:*` buckets when possible instead of reading attached-note buckets unnecessarily (#360)
- Journal-only filtering now composes correctly with created-at date range filters (#360)

## [0.11.0] - 2026-03-22

This release adds first-class created-at date range filtering for notes, making it easier to query journal entries and note history without scanning unrelated journal buckets.

### Added
- `todu note list` now supports `--from` and `--to` date range filters for note created-at searches (#358)

### Changed
- Note filtering now supports created-at range bounds across the shared filter model, engine, CLI, and Electron tools surface (#358)

### Fixed
- Global date range note queries now narrow journal bucket reads to matching months before applying note-level filtering, avoiding unrelated journal bucket scans when possible (#358)
- Invalid note date range input now fails with clear validation errors, including inverted ranges and malformed dates (#358)

## Rename note

- Historical changelog entries may still reference `todu` commands or artifact names because they describe behavior as it shipped at the time.
- Current releases should prefer `todu` by default, with compatibility aliases called out only where they still matter for transition or upgrade behavior.

## [0.10.0] - 2026-03-17

This release completes the `todu` -> `todu` transition for the primary user experience. The CLI, app branding, runtime defaults, release assets, and docs now present `todu` as the canonical name, while temporary compatibility aliases remain in place where needed for upgrades.

### Changed

- The primary CLI and Electron app branding now use `todu` by default, with compatibility aliases such as `todu` retained where needed during the transition (#353)
- Default config, data, and runtime paths now prefer `~/.config/todu` and `.todu`, with automatic migration from legacy `todu` locations and normalization of embedded legacy paths (#354)
- Release tooling, installer/dev helpers, canonical docs, and integration-test fixtures now default to `todu` / `TODU_*` so shipped artifacts and examples no longer encode stale `todu` branding assumptions (#355)

## [0.9.3] - 2026-03-17

Patch release eliminating a startup performance regression introduced by the engine prefetch.

### Fixed

- Daemon startup no longer eagerly prefetches all sub-documents at init time — with large journal histories this was saturating the storage layer and pushing startup past the 10s health check timeout, causing `todu daemon start/restart` to always report failure (#348)

## [0.9.2] - 2026-03-17

Patch release preventing sync cycle aborts on oversized external content.

### Fixed

- Sync cycles no longer abort when an external issue description or comment body exceeds 10,000 characters — oversized content is now truncated to the limit with a `... [truncated]` suffix and the rest of the cycle continues normally (#346)

## [0.9.1] - 2026-03-14

This patch release closes a CLI gap so habit comments can be managed from the terminal as well as from the Electron app.

### Fixed
- `todu note add` and `todu note list` now support `--habit <id>`, making it possible to add and view habit-attached comments from the CLI using the same underlying capability already available in Electron (#343)

## [0.9.0] - 2026-03-14

This release expands the shared integration model so each binding can carry provider-specific desired-state options from creation time through the first sync cycle.

### Added
- Integration bindings now support an optional per-binding `options` object in shared core state, allowing provider-specific desired-state settings such as bootstrap behavior to be configured at bind time instead of only through local plugin config (#342)

### Changed
- The CLI now supports `todu integration add --options <json>` and `todu integration update --options <json>`, and detailed integration output shows configured binding options (#342)
- Plugin/provider docs and integration architecture docs now define binding `options` as shared desired-state only, while keeping secrets and runtime internals local to the authority daemon host (#342)

## [0.8.0] - 2026-03-14

This release expands import fidelity and project context across todu. Habits are now project-scoped, the Electron app shows its version in Settings, journal imports can preserve historical dates from the CLI, and synced issue imports now keep source-system task timestamps.

### Added
- Habits now belong to projects across the core model, engine, daemon, CLI, and Electron app, making project ownership explicit for habit tracking (#336)
- The Electron Settings view now shows the running app version so users can verify which build is installed (#338)
- `todu note add` now supports `--created-at` for importing backdated journal entries from existing notes or scripts (#339)

### Changed
- Sync-provider pull now preserves imported task timestamps so newly imported tasks keep external history and existing linked tasks retain stable `createdAt` values across later sync updates (#340)

### Fixed
- Backdated journal imports now store entries in the correct historical journal buckets instead of using import-time dates (#339)
- Imported synced tasks now preserve external `createdAt` and `updatedAt` values, with deterministic fallback when only one timestamp is available (#340)

## [0.7.7] - 2026-03-11

Raises validation limits for task descriptions and note content.

### Fixed
- Task descriptions and note content now accept up to 10,000 characters, up from 2,000 and 5,000 respectively (#330)

## [0.7.6] - 2026-03-11

Patch release restoring observability for direct daemon lifecycle mode.

### Fixed
- Direct daemon lifecycle mode now preserves detached daemon stdout and stderr in durable log files under `<data_dir>` instead of discarding them when no system service manager is configured (#328)

### Changed
- Oversized direct-mode daemon log files now rotate on startup, keeping `.1` and `.2` archives for troubleshooting continuity (#328)
- CLI daemon usage and service operations docs now document the direct-mode log file paths and rotation behavior (#328)

## [0.7.5] - 2026-03-11

Patch release focused on sync correctness, recurring reliability, and legacy task-data compatibility.

### Fixed
- The daemon sync worker now applies pulled sync-provider tasks correctly so external task updates are created or reconciled locally instead of being dropped (#316)
- Pushed task link metadata is now written back onto local tasks so externally-created tasks keep their `externalId` and `sourceUrl` mappings for future sync passes (#318)
- Pulled external comments now resolve to the correct local task IDs during reconciliation, preventing synced comments from attaching to the wrong task or orphan placeholder IDs (#320)
- Recurring startup no longer hangs on DST-transition schedules, allowing the recurring worker to make forward progress across daylight saving boundary calculations (#324)
- Legacy task list documents missing `labels` or `assignees` arrays no longer crash task reads, so the Tasks view loads safely for older datasets (#326)

### Changed
- Added regression coverage for legacy persisted task documents with missing array fields during task-list reads (#326)

## [0.7.4] - 2026-03-11

Patch release fixing a recurring-worker startup hang caused by DST-transition recurrence calculations.

### Fixed
- The daemon no longer hangs during startup when recurring-worker processes existing local recurring data that crosses daylight saving time boundaries (#324)
- Recurrence date progression now skips same-local-date results across DST transitions so recurring processing makes forward progress instead of looping on the same day (#324)

### Changed
- Scheduled-date validation now uses the corrected next-occurrence progression logic so DST-aware recurrence checks stay consistent with recurring processing behavior (#324)
- Added regression coverage for daily and weekly America/Chicago DST-transition recurrence cases in the engine schedule tests (#324)

## [0.7.3] - 2026-03-11

Patch release fixing pull-side comment attachment for bidirectional sync and aligning the default local PR gate with the unit-test-only workflow.

### Fixed
- Pulled external comments now resolve their `externalTaskId` through local task `externalId` mappings before note reconciliation, so synced comments attach to the correct local task instead of a non-existent external ID placeholder (#320)
- Pull-side comment sync now skips comments whose parent task has not been imported locally yet, preventing orphaned note writes during partial sync states (#320)

### Changed
- `make pre-pr` now runs lint/typecheck, unit tests, and build without running integration suites by default (#320)
- Contributing docs and the PR template now match the updated `make pre-pr` contract (#320)

## [0.7.2] - 2026-03-11

Patch release fixing bidirectional sync duplication for locally-created tasks that are pushed to external providers.

### Fixed
- Sync providers can now return task linkage data from `push()` so the daemon writes back `externalId` and `sourceUrl` onto local tasks after remote creation (#318)
- Bidirectional sync no longer re-imports previously pushed local tasks as duplicates on later pull cycles, preventing repeated issue/task fan-out (#318)

### Changed
- The sync runtime now applies pushed task links before pushed comment links and fails clearly when a provider returns a conflicting task mapping (#318)
- Sync provider API docs now describe the push-side task link contract for provider authors (#318)

## [0.7.1] - 2026-03-11

Patch release fixing sync-provider pull behavior for external tasks.

### Fixed
- The daemon sync worker now consumes `pullResult.tasks` from sync providers instead of silently discarding pulled external tasks (#316)
- Pulled external tasks are now mapped through `provider.mapToTask(...)` and created or updated locally using freshness checks so newer external task state appears in the bound todu project (#316)

### Changed
- Task create/update inputs now preserve sync linkage fields needed by pulled task reconciliation, including status, external ID, and source URL (#316)
- Sync provider API docs now describe the pulled-task reconciliation behavior for provider authors (#316)

## [0.7.0] - 2026-03-10

Sync-provider push-side comment linking for local-origin note sync.

### Added
- Sync providers can now return push result comment link updates so notes created locally in todu can be linked to remotely-created comments and continue syncing through the existing pull reconciliation flow
- The sync runtime now applies returned comment links idempotently using canonical `sync:externalId:<externalCommentId>` tags on local task notes
- Sync provider API docs now document the push result comment link contract and provider API version 2

### Changed
- The sync provider API version is now `2`
- `SyncProvider.push()` now returns `SyncProviderPushResult`, making push-side comment linkage an explicit runtime contract

## [0.6.0] - 2026-03-10

Sync-provider comment sync support.

### Added
- Comment/note sync through the sync-provider runtime — push exposes task comments via `TaskPushPayload`, pull reconciles external comments with local notes using snapshot-based create/update/delete
- `ExternalComment` pull results are now consumed by the runtime with last-write-wins conflict resolution on comment-level timestamps
- Plugin sync provider API docs updated with comment sync contract details

## [0.5.0] - 2026-03-10

Task assignee support and faster developer workflow.

### Added
- Task assignee field across core types, engine, and sync-provider contract
- Sync providers now receive task descriptions during push via `TaskWithDetail`
- Assignee validation on task create and update

### Changed
- `SyncProvider.push()` and `mapFromTask()` accept `TaskWithDetail` instead of `Task`
- Test suite split: unit tests run in ~2s by default, integration tests opt-in via `make test-all`
- CI runs unit tests only (~30s total pipeline)

### Removed
- Obsolete habit tests from Electron tools module

## [0.4.0] - 2026-03-09

This release introduces todu’s first generic external integration control plane. Integration bindings now live in shared core state, can be managed from the CLI through the daemon, and drive provider execution from the authority daemon while exposing synced runtime status to other machines.

### Added

- Added the core integration binding model, validation rules, and catalog graph support, including a shared integration registry document, per-binding status documents, and one-binding-per-project enforcement (#303).
- Added engine APIs for creating, listing, updating, deleting, and querying integration bindings and their runtime status (#304).
- Added daemon protocol support for integration binding CRUD and status queries so integration management works through the daemon surface (#305).
- Added generic CLI integration management commands under `todu integration ...` for listing, creating, updating, enabling, disabling, removing, and inspecting integration bindings (#306).
- Added binding-driven sync runtime orchestration so authority daemons enumerate shared integration bindings, execute provider work per binding, and persist per-binding synced status for later observers (#307).

### Changed

- External sync now uses integration bindings as the sole core control plane; project-level external sync metadata and CLI project sync output were removed to complete the cutover (#308).

### Documentation

- Added and refined the integration architecture, plugin boundary, and provider contract docs that define the binding-driven design and operator expectations (#301, #302).

## [0.3.0] - 2026-03-07

This release adds end-to-end recurring template miss policy support, letting users choose whether missed recurring work should accumulate as backlog or roll forward to only the latest due occurrence.

### Added

- Recurring templates now support a `missPolicy` setting in the core model and engine, with `accumulate` as the default and `rollForward` available for templates that should avoid backlog buildup (#289, #2164).
- The CLI now supports recurring `missPolicy` on create and update, and shows the effective policy in list/show output, including legacy templates that implicitly behave as `accumulate` (#290, #2165).
- The Electron app now lets users choose and edit recurring `missPolicy`, explains the behavior in the UI, and shows the active policy in recurring template views (#291, #2166).

### Fixed

- Recurring templates no longer expose a comments thread in the Electron detail view, aligning the UI with the notes model so discussion lives on generated tasks instead of configuration templates (#293, #2097).
- `todu --version` now prints a plain version string again without extra playful suffix text (#292, #2065).

## [0.2.2] - 2026-03-06

Patch release focused on standalone CLI daemon lifecycle reliability and release/tooling consistency.

### Fixed

- Standalone compiled CLI binaries now start and run the daemon in direct mode using an internal self-relaunch path instead of JS entrypoint path spawning, fixing direct lifecycle failures in release binaries (#281, #2145).
- CLI typecheck/release flow now consistently resolves daemon workspace artifacts in CI, preventing false-negative typecheck failures during release validation (#281, #2145).
- Release tooling now keeps CLI version source metadata in sync with package release versioning (commit `95c0c66`).

### Changed

- Daemon bootstrap logic is now exposed for CLI reuse through a dedicated runtime entry module, while the daemon script entrypoint remains a thin launcher (#281).

## [0.2.1] - 2026-03-05

Patch release focused on standalone CLI reliability for release binaries.

### Fixed

- Standalone Linux CLI release binaries now initialize Automerge WASM using compile-safe/runtime-safe paths instead of build-host path resolution, preventing startup failures in released artifacts (#279)
- Added a Linux release smoke gate that runs standalone CLI `--version` and `--help`, and fails if the known bad CI-only Automerge wasm path reference appears in the binary (#279)

## [0.2.0] - 2026-03-05

Major daemon-first milestone release. This version moves CLI/Electron onto a local daemon RPC model, adds worker/plugin execution infrastructure, and ships recurring automation as a standalone plugin.

### Added

- Daemon runtime and protocol foundation including secure UDS transport, `daemon.hello`, `daemon.ping`, `daemon.status`, events subscription, request timeout policy, and protocol conformance coverage (#212, #213, #214, #215, #216, #217, #218, #219)
- Daemon RPC adapters for core domains (project/task/label/note/recurring/habit/sync) and parity/event coverage suites (#220, #221, #222, #223)
- Worker runtime lifecycle in daemon with executable worker contracts, status visibility, static assignment controls, and required-domain gating (#253, #254, #255, #256, #272)
- Plugin platform for daemon workers: sync provider contract + compatibility checks, plugin loader/config resolution, CLI plugin install/list/remove/config commands, and sync worker scheduler with retry policy (#273, #274, #275, #276)
- Standalone recurring automation worker package (`@todu/recurring-worker`) with generic worker-plugin loading support and boundary enforcement tests (#277)

### Changed

- CLI command execution is daemon-first, including daemon lifecycle commands and daemon transport integration (#224, #225, #226, #231, #233)
- Electron main process now routes task operations through daemon connectivity and event-driven reactivity instead of local ownership startup paths (#236, #237, #238, #239)
- Join workflow is now daemon-mediated and transactional, with explicit check/switch behavior and rollback safety (#241, #246, #247)
- Recurring automation no longer runs implicitly at startup; automation now runs via worker/plugin execution paths (#261, #277)
- Notes storage is partitioned into bucketed documents for better scaling and reduced contention (#259)

### Fixed

- Engine bootstrap no longer depends on plugin-name coupling for startup processing policy (#263)
- CI/storage stability and merge-safety behavior hardened for teardown/race and post-merge regression scenarios (#249, #251)

## [0.1.1] - 2026-02-15

Release pipeline fixes — all three platform builds should now complete successfully.

### Fixed

- App icon replaced with properly formatted 1024x1024 RGBA PNG plus pre-built .icns and .ico formats, fixing electron-builder icon converter crash on macOS and Windows
- Windows CLI binary build uses native compilation instead of cross-compile target that failed to download
- npm publish step tolerates re-runs when packages are already published at the current version
- npm verify step retries with backoff instead of failing on registry propagation delay
- Workspace dependency versions use wildcard to prevent resolution failures when version numbers change

## [0.1.0] - 2026-02-15

First release of todu — a local-first task manager with an AI agent assistant. Includes a CLI, an Electron desktop app, and standalone binaries for all major platforms.

### Added

- **Core engine** — CRDT-based storage with Automerge for offline-first, conflict-free data (#6, #7, #8)
- **CLI** — Full task management from the terminal: tasks, projects, labels, notes, habits, recurring templates, configuration (#6–#10, #13–#16)
- **Electron desktop app** — React-based UI with sidebar navigation, home dashboard, dark/light theming (#17, #23–#27, #43–#45)
- **Embedded AI agent** — Chat pane with tool-calling support; agent can create, search, and navigate to tasks, projects, habits, and recurring templates (#38, #52–#62)
- **Focused entity context** — Detail views report the current entity to the agent for contextual updates (#58)
- **Habits** — Create habits, check in daily, track streaks and history (#16, #26)
- **Recurring templates** — Schedule repeating tasks with RRULE support, skip lists, and upcoming view (#14, #15, #25)
- **Journal** — Writing tool with TipTap markdown editor (#42, #51)
- **Home dashboard** — Task sections grouped by status with habit check-in panel (#45)
- **Standalone CLI binaries** — Zero-dependency executables via `bun compile` for linux-x64, linux-arm64, darwin-x64, darwin-arm64, windows-x64 (#67)
- **Electron packaging** — Installers for Linux (.deb, .AppImage), macOS (.dmg), and Windows (.exe) with bundled CLI (#68)
- **Release pipeline** — Tag-triggered GitHub Actions workflow: parallel platform builds, GitHub Release with checksums, npm publishing (#69)
- **npm packages** — `@todu/core`, `@todu/engine`, `@todu/cli` configured for public publishing (#66)
