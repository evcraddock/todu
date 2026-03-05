# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
