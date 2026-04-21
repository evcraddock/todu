# todu

[![CI](https://github.com/evcraddock/todu/actions/workflows/ci.yml/badge.svg)](https://github.com/evcraddock/todu/actions/workflows/ci.yml)

todu is a local-first task management project (CLI + Electron) backed by a local daemon and Automerge sync.

## Install

### Desktop app (recommended on Linux and macOS)

Desktop releases bundle the local daemon runtime. Launching the packaged app starts and manages that bundled daemon automatically for normal desktop usage.

#### Linux install

Install the latest Linux desktop build with AppImage integration and a launcher entry:

```bash
curl -fsSL https://raw.githubusercontent.com/evcraddock/todu/main/scripts/install-linux.sh | bash
```

Install a specific version:

```bash
curl -fsSL https://raw.githubusercontent.com/evcraddock/todu/main/scripts/install-linux.sh | bash -s -- 0.18.0
```

This installs `todu.AppImage` into `~/.local/bin` and creates a desktop launcher in `~/.local/share/applications`.

#### macOS install

Install the latest macOS desktop build into `/Applications`:

```bash
curl -fsSL https://raw.githubusercontent.com/evcraddock/todu/main/scripts/install-mac.sh | bash
```

Install a specific version:

```bash
curl -fsSL https://raw.githubusercontent.com/evcraddock/todu/main/scripts/install-mac.sh | bash -s -- 0.18.0
```

This downloads the release DMG, mounts it, copies `todu.app` into `/Applications`, and unmounts the DMG.

Windows desktop packaging is not released yet because the local daemon transport is currently implemented for Unix domain sockets. Windows users should use the CLI companion for now.

### CLI companion (optional)

Most desktop users do **not** need the CLI for normal app usage. The packaged desktop app bundles and manages the local daemon on its own.

Use the CLI when you want power-user workflows like:

- `todu daemon status`
- `todu daemon start|stop|restart`
- scripting or automation
- plugin or daemon-oriented local operations

Prerequisites:

- Node.js 20+
- npm

Install the latest CLI:

```bash
npm install -g @todu/cli
```

Install the CLI version matching a desktop release:

```bash
npm install -g @todu/cli@<desktop-version>
```

Upgrade:

```bash
npm install -g @todu/cli@latest
```

Compatibility guidance:

- Preferred: keep the CLI version aligned with your desktop app version.
- The desktop app version is shown in Settings and in release notes.
- The CLI and desktop app both use the same default user-local config and data paths, so the CLI targets the same local daemon and dataset unless you override paths with env vars.

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

For daemon path details and overrides, see [docs/cli-daemon-usage.md](docs/cli-daemon-usage.md).

## Key docs

- Contributing and required workflow: [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Dependency maintenance: [docs/dependency-maintenance.md](docs/dependency-maintenance.md)
- Daemon CLI behavior: [docs/cli-daemon-usage.md](docs/cli-daemon-usage.md)
- Electron multi-user management: [docs/electron-actor-project-auth.md](docs/electron-actor-project-auth.md)

## License

MIT
