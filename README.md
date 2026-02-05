# todu

Local-first task management with offline support and seamless sync

## Prerequisites

- Node.js 20+ or Bun 1.0+

## Installation

```bash
bun install
# or
npm install
```

## How to Work on This Project

### Start the Dev Environment

```bash
make dev
```

This starts all services defined in `Procfile.dev`. The command returns immediately (daemonized).

### View Logs

```bash
# Stream all logs (Ctrl+C to stop)
make dev-logs

# Quick peek at recent logs
make dev-tail
```

### Check Status

```bash
make dev-status
```

### Stop the Dev Environment

```bash
make dev-stop
```

### Run Tests and Linting

```bash
make check
```

### Before Opening a PR

```bash
make pre-pr
```

### Available Make Commands

```bash
make help
```

## Dev Environment Setup

If `make dev` fails, the dev environment needs configuration. See task #1560 "Set up dev environment" for details on configuring `Procfile.dev` and any required services.

## License

MIT
