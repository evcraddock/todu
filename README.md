# todu

[![CI](https://github.com/evcraddock/todu/actions/workflows/ci.yml/badge.svg)](https://github.com/evcraddock/todu/actions/workflows/ci.yml)

Local-first task management with offline support and seamless sync

## Prerequisites

- Node.js 20+
- Bun 1.0+ (for building standalone CLI binaries)

## Installation

```bash
npm install
```

## Development

### Run CLI Commands

```bash
make run ARGS="--help"
make run ARGS="task list"
```

The packaged executable is currently named `toduai` to avoid collisions with production `todu` during migration.

### Run daemon-backed dev environment (recommended)

```bash
make build
make dev
```

`make dev` starts both processes under overmind:

- local daemon (`toduai-daemon`) with test data dir: `.dev/data`
- local sync server (docker compose): `ws://localhost:3030`

To enable daemon debug logs during development:

```bash
TODUAI_LOG_LEVEL=debug make dev
```

In another terminal, run CRUD commands against that test instance:

```bash
make run ARGS="project list"
make run ARGS="task create --project inbox --title 'test'"
make run ARGS="note list"
make run ARGS="daemon status"
```

Stop the dev environment:

```bash
make dev-stop
```

### Run Tests and Linting

```bash
make check
```

### Available Commands

Run `make help` to see all targets. Key commands:

#### Build & Quality

| Command               | Description                                        |
| --------------------- | -------------------------------------------------- |
| `make help`           | Show all available targets                         |
| `make build`          | Build all packages (core → engine → cli)           |
| `make test`           | Run tests                                          |
| `make check`          | Lint + format + typecheck (auto-fixes formatting)  |
| `make check-ci`       | Lint + format + typecheck (no auto-fix, CI mode)   |
| `make typecheck`      | TypeScript type checking only                      |
| `make pre-pr`         | Full pre-PR checks (check + test + build)          |
| `make clean`          | Remove build artifacts                             |

#### Development

| Command                  | Description                                              |
| ------------------------ | -------------------------------------------------------- |
| `make run ARGS="..."`    | Run CLI (e.g. `make run ARGS="task list"`)               |
| `make dev`              | Start overmind dev stack (daemon + local sync server)   |
| `make dev-status`       | Show overmind stack status                               |
| `make dev-logs`         | Connect to overmind session                              |
| `make dev-tail`         | Show recent overmind logs                                |
| `make dev-stop`         | Stop overmind dev stack                                  |
| `make dev-electron`     | Launch Electron app in dev mode (hot reload)            |

#### CLI Binaries

| Command                  | Description                                      |
| ------------------------ | ------------------------------------------------ |
| `make build-cli-binary`  | Build standalone CLI binary for current platform  |
| `make build-cli-binaries`| Build standalone CLI binaries for all platforms   |

#### Electron & Distribution

| Command              | Description                                   |
| -------------------- | --------------------------------------------- |
| `make build-electron`| Build Electron app for distribution            |
| `make dist`          | Build installer for current platform           |
| `make dist-linux`    | Build Linux installers (.deb, .rpm, .AppImage) |
| `make dist-mac`      | Build macOS installer (.dmg)                   |
| `make dist-win`      | Build Windows installer (.exe)                 |

#### Version Management

| Command              | Description                          |
| -------------------- | ------------------------------------ |
| `make version`       | Show current version of all packages |
| `make version-check` | Verify all package versions match    |

### Before Opening a PR

```bash
make pre-pr
```

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for details on:

- Package structure
- Automerge-based local-first design
- Sync architecture
- Plugin system

## License

MIT
