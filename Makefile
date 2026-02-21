.PHONY: build test check check-ci typecheck pre-pr run clean help dev dev-stop dev-status dev-logs dev-tail dev-electron build-electron build-cli-binary build-cli-binaries dist dist-linux dist-mac dist-win version version-check node_modules check-bun

SOCKET := ./.overmind.sock

# =============================================================================
# Dependency checks
# =============================================================================

node_modules: ## Install dependencies if missing
	@if [ ! -d node_modules ]; then \
		echo "node_modules not found. Running npm install..."; \
		npm install; \
	fi

check-bun: ## Verify bun is installed (needed for CLI binary builds)
	@command -v bun >/dev/null 2>&1 || { echo "❌ bun is required for CLI binary builds. Install from https://bun.sh"; exit 1; }

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

# =============================================================================
# Build & Quality
# =============================================================================

build: node_modules ## Build all packages (core → engine → cli)
	npm run build

test: node_modules ## Run tests
	npm test

check: node_modules ## Lint + format + typecheck (auto-fixes formatting)
	npm run check

check-ci: node_modules ## Lint + format + typecheck (no auto-fix, CI mode)
	npm run check:ci

typecheck: node_modules ## Run TypeScript type checking only
	npm run typecheck

pre-pr: node_modules ## Run pre-PR checks (check + test + build)
	npm run check:ci
	npm test
	npm run build

clean: ## Remove build artifacts
	rm -rf packages/*/dist packages/*/*.tsbuildinfo dist/cli

# =============================================================================
# CLI Binary Builds
# =============================================================================

build-cli-binary: check-bun build ## Build standalone CLI binary for current platform
	@mkdir -p dist/cli
	bun build --compile packages/cli/src/index.ts --outfile dist/cli/toduai
	@echo "Built: dist/cli/toduai ($$(ls -lh dist/cli/toduai | awk '{print $$5}'))"

build-cli-binaries: check-bun build ## Build standalone CLI binaries for all platforms
	@mkdir -p dist/cli
	bun build --compile --target=bun-linux-x64-baseline packages/cli/src/index.ts --outfile dist/cli/toduai-cli-linux-x64
	bun build --compile --target=bun-linux-arm64 packages/cli/src/index.ts --outfile dist/cli/toduai-cli-linux-arm64
	bun build --compile --target=bun-darwin-x64 packages/cli/src/index.ts --outfile dist/cli/toduai-cli-darwin-x64
	bun build --compile --target=bun-darwin-arm64 packages/cli/src/index.ts --outfile dist/cli/toduai-cli-darwin-arm64
	bun build --compile --target=bun-windows-x64-baseline packages/cli/src/index.ts --outfile dist/cli/toduai-cli-windows-x64.exe
	@echo "Built all CLI binaries:"
	@ls -lh dist/cli/

# =============================================================================
# Development
# =============================================================================

run: node_modules ## Run CLI (usage: make run ARGS="task list")
	node packages/cli/dist/index.js $(ARGS)

dev: node_modules ## Start dev environment (sync server via overmind)
	overmind start -D -s $(SOCKET)

dev-stop: ## Stop dev environment
	overmind quit -s $(SOCKET) 2>/dev/null || true
	rm -f $(SOCKET)

dev-status: ## Check if dev environment is running (outputs: running | stopped)
	@overmind ps -s $(SOCKET) 2>/dev/null | grep -q "." && echo "running" || echo "stopped"

dev-logs: ## Stream dev environment logs (Ctrl+C to stop)
	overmind echo -s $(SOCKET)

dev-tail: ## Show last 100 lines of dev logs (non-blocking)
	@timeout 2 overmind echo -s $(SOCKET) 2>/dev/null | tail -100 || true

# =============================================================================
# Electron
# =============================================================================

dev-electron: node_modules ## Launch Electron app in dev mode (hot reload)
	npm run --workspace=packages/electron dev

build-electron: node_modules ## Build Electron app for distribution
	npm run --workspace=packages/electron build

# =============================================================================
# Distribution
# =============================================================================

dist: check-bun build build-electron build-cli-binary ## Build installer for current platform
	npm run --workspace=packages/electron dist

dist-linux: build build-electron ## Build Linux installers (.deb, .rpm, .AppImage)
	npm run --workspace=packages/electron dist:linux

dist-mac: build build-electron ## Build macOS installer (.dmg)
	npm run --workspace=packages/electron dist:mac

dist-win: build build-electron ## Build Windows installer (.exe)
	npm run --workspace=packages/electron dist:win

# =============================================================================
# Version Management
# =============================================================================

version: ## Show current version of all packages
	@echo "Versions:"
	@echo "  core:     $$(node -p "require('./packages/core/package.json').version")"
	@echo "  engine:   $$(node -p "require('./packages/engine/package.json').version")"
	@echo "  cli:      $$(node -p "require('./packages/cli/package.json').version")"
	@echo "  electron: $$(node -p "require('./packages/electron/package.json').version")"

version-check: ## Verify all package versions match
	@V1=$$(node -p "require('./packages/core/package.json').version") && \
	V2=$$(node -p "require('./packages/engine/package.json').version") && \
	V3=$$(node -p "require('./packages/cli/package.json').version") && \
	V4=$$(node -p "require('./packages/electron/package.json').version") && \
	if [ "$$V1" = "$$V2" ] && [ "$$V2" = "$$V3" ] && [ "$$V3" = "$$V4" ]; then \
		echo "✅ All packages at version $$V1"; \
	else \
		echo "❌ Version mismatch: core=$$V1 engine=$$V2 cli=$$V3 electron=$$V4"; \
		exit 1; \
	fi


