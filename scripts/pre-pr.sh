#!/bin/bash
set -e

echo "Running pre-PR checks..."

echo "→ Formatting..."
bun run format

echo "→ Linting..."
bun run lint

echo "→ Type checking..."
bun run typecheck

echo "→ Running tests..."
bun test

echo "✓ All checks passed!"
