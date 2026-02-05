# todu - Agent Guidelines

## Project Overview

Local-first task management using Automerge CRDTs. Monorepo with:
- `packages/core` - Data models, Automerge documents, sync logic
- `packages/cli` - Command-line interface
- `packages/electron` - Desktop app
- `packages/sync-server` - Multi-device sync server

## Tech Stack

- **Language**: TypeScript (strict mode)
- **Runtime**: Bun (preferred), Node.js compatible
- **Data**: Automerge for CRDT-based storage
- **Desktop**: Electron
- **Monorepo**: Bun workspaces

## Architecture Principles

### Local-First
- All data lives locally first
- App must work fully offline
- Sync is additive, not required
- Never block on network operations

### Automerge Guidelines
- Each document type has a schema in `packages/core/src/schema/`
- Use `@automerge/automerge` for documents
- Use `@automerge/automerge-repo` for storage/sync
- Changes are always local-first, then synced

### Package Boundaries
- `core` has zero UI dependencies
- `cli` imports from `core`, never from `electron`
- `electron` imports from `core`
- `sync-server` imports from `core`

## Code Standards

### TypeScript
- Strict mode enabled
- Explicit return types on public functions
- Prefer `type` over `interface` for data shapes
- Use branded types for IDs (e.g., `TaskId`, `ProjectId`)

### Error Handling
- Use Result types for expected errors
- Throw only for programmer errors
- Always include context in error messages

### Testing
- Unit tests for core logic
- Integration tests for CLI commands
- E2E tests for Electron (Playwright)

## File Naming

- `kebab-case.ts` for files
- `PascalCase` for types/classes
- `camelCase` for functions/variables
- `SCREAMING_SNAKE_CASE` for constants

## Common Commands

```bash
bun install          # Install dependencies
bun run dev:cli      # Run CLI in dev
bun run dev:electron # Run Electron in dev
bun run test         # Run all tests
bun run lint         # Lint all packages
bun run typecheck    # Type check all packages
```

## Before Committing

1. `bun run typecheck` passes
2. `bun run lint` passes
3. `bun run test` passes
4. Commit message explains "why"
