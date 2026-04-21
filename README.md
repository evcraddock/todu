# todu

[![CI](https://github.com/evcraddock/todu/actions/workflows/ci.yml/badge.svg)](https://github.com/evcraddock/todu/actions/workflows/ci.yml)

todu is a local-first task management project (CLI + Electron) backed by a local daemon and Automerge sync.

## Install

### Desktop app (recommended)

Download the latest desktop release for your platform from GitHub Releases:

- Linux: `.AppImage` or `.deb`
- macOS: `.dmg`
- Windows: `.exe`

Desktop releases bundle the local daemon runtime. Launching the packaged app starts and manages that bundled daemon automatically for normal desktop usage.

### CLI

Prerequisites:

- Node.js 20+
- npm

Install:

```bash
npm install -g @todu/cli
```

Upgrade:

```bash
npm install -g @todu/cli@latest
```

### Build from source

Additional prerequisite for standalone CLI binaries:

- Bun 1.0+

Build workspace packages:

```bash
npm install
make build
```

Build/install desktop app from a source checkout:

```bash
make dist
make install
```

- Linux install script uses the generated AppImage.
- macOS install script mounts the generated DMG and copies the app to `/Applications`.

## Work on the project

Read first: [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)

### Dev prerequisites

For the full local dev stack (`make dev`):

- [overmind](https://github.com/DarthSim/overmind)
- Docker (for local sync-server in `docker compose`)

### Start/stop dev stack

```bash
make dev
make dev-stop
```

This starts:
- local daemon (`packages/daemon/src/entrypoint.ts`)
- local sync-server (`docker compose up sync-server`)

### Core development commands

```bash
make run ARGS="daemon status"
make check
make test
make pre-pr
```

If you are working on Electron UI:

```bash
make dev-electron
```

## Key docs

- Contributing and required workflow: [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Dependency maintenance: [docs/dependency-maintenance.md](docs/dependency-maintenance.md)
- Daemon CLI behavior: [docs/cli-daemon-usage.md](docs/cli-daemon-usage.md)
- Electron multi-user management: [docs/electron-actor-project-auth.md](docs/electron-actor-project-auth.md)

## License

MIT
