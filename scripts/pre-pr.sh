#!/bin/bash
set -e

echo "Running pre-PR checks..."

echo "→ Linting + formatting + type checking..."
npm run check:ci

echo "→ Running protocol conformance suite..."
npm run test:conformance

echo "→ Running tests..."
npm test

echo "✓ All checks passed!"
