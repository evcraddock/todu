# todu

Local-first task management with offline support and seamless sync.

A rewrite of todu-api and todu.sh using [Automerge](https://automerge.org/) CRDTs for conflict-free collaboration across devices.

## Features

- **Local-first**: Works offline, syncs when connected
- **Desktop app**: Electron-based GUI
- **CLI**: Full command-line interface
- **Sync server**: Optional server for multi-device sync
- **Conflict-free**: Automerge CRDTs handle merges automatically

## Architecture

```
┌─────────────┐     ┌─────────────┐
│  Electron   │     │    CLI      │
│    App      │     │             │
└──────┬──────┘     └──────┬──────┘
       │                   │
       └─────────┬─────────┘
                 │
         ┌───────┴───────┐
         │  Core Library │
         │  (Automerge)  │
         └───────┬───────┘
                 │
         ┌───────┴───────┐
         │  Sync Server  │
         │  (optional)   │
         └───────────────┘
```

## Packages

- `packages/core` - Shared data models and Automerge logic
- `packages/cli` - Command-line interface
- `packages/electron` - Desktop application
- `packages/sync-server` - Sync server for multi-device support

## Development

```bash
# Install dependencies
bun install

# Run CLI in dev mode
bun run dev:cli

# Run Electron app in dev mode
bun run dev:electron

# Run sync server
bun run dev:sync
```

## Building

```bash
# Build all packages
bun run build

# Build CLI only
bun run build:cli

# Build Electron app
bun run build:electron
```

## License

MIT
