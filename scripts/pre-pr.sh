#!/usr/bin/env bash
set -euo pipefail

echo "==> Running pre-PR checks..."

echo "==> Type checking..."
bun run typecheck

echo "==> Linting..."
bun run lint

echo "==> Running tests..."
bun test

echo "==> All checks passed!"
