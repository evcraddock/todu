# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- Added generic CLI integration management commands under `toduai integration ...` for listing, creating, updating, enabling, disabling, removing, and inspecting integration bindings (#306).
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
