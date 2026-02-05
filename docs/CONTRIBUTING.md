# Contributing to todu

## Getting Started

1. Clone the repository
2. Install dependencies: `bun install`
3. Run tests: `bun run test`

## Development Workflow

1. Create a branch from `main`
2. Make changes following the code standards in AGENTS.md
3. Write/update tests
4. Run the pre-PR checks: `bun run pre-pr`
5. Open a pull request

## Pull Request Guidelines

- Keep PRs focused on a single change
- Include tests for new functionality
- Update documentation as needed
- Ensure all CI checks pass

## Code Style

- TypeScript strict mode
- ESLint + Prettier for formatting
- Run `bun run lint` before committing

## Testing

- `bun run test` - Run all tests
- `bun run test:core` - Run core package tests
- `bun run test:cli` - Run CLI tests

## Architecture

See AGENTS.md for architecture guidelines and package boundaries.
