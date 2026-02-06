# todu

[![CI](https://github.com/evcraddock/todu/actions/workflows/ci.yml/badge.svg)](https://github.com/evcraddock/todu/actions/workflows/ci.yml)

Local-first task management with offline support and seamless sync

## Prerequisites

- Bun 1.0+

## Installation

```bash
bun install
```

## Development

### Run CLI Commands

```bash
make run ARGS="--help"
make run ARGS="task list"
```

### Run Tests and Linting

```bash
make check
```

### Available Commands

```bash
make help
```

| Command | Description |
|---------|-------------|
| `make build` | Build all packages |
| `make test` | Run tests |
| `make lint` | Run linter |
| `make typecheck` | TypeScript type checking |
| `make check` | Lint + test |
| `make pre-pr` | Full pre-PR checks |
| `make run ARGS="..."` | Run CLI commands |

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
