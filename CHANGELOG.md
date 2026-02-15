# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
