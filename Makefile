.PHONY: build test check check-ci typecheck pre-pr run clean help dev-electron build-electron build-cli-binary build-cli-binaries dist dist-linux dist-mac dist-win version version-check

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

# =============================================================================
# Build & Quality
# =============================================================================

build: ## Build all packages (core → engine → cli)
	npm run build

test: ## Run tests
	npm test

check: ## Lint + format + typecheck (auto-fixes formatting)
	npm run check

check-ci: ## Lint + format + typecheck (no auto-fix, CI mode)
	npm run check:ci

typecheck: ## Run TypeScript type checking only
	npm run typecheck

pre-pr: ## Run pre-PR checks (check + test + build)
	npm run check:ci
	npm test
	npm run build

clean: ## Remove build artifacts
	rm -rf packages/*/dist packages/*/*.tsbuildinfo dist/cli

# =============================================================================
# CLI Binary Builds
# =============================================================================

build-cli-binary: build ## Build standalone CLI binary for current platform
	@mkdir -p dist/cli
	bun build --compile packages/cli/src/index.ts --outfile dist/cli/todu
	@echo "Built: dist/cli/todu ($$(ls -lh dist/cli/todu | awk '{print $$5}'))"

build-cli-binaries: build ## Build standalone CLI binaries for all platforms
	@mkdir -p dist/cli
	bun build --compile --target=bun-linux-x64-baseline packages/cli/src/index.ts --outfile dist/cli/todu-cli-linux-x64
	bun build --compile --target=bun-linux-arm64 packages/cli/src/index.ts --outfile dist/cli/todu-cli-linux-arm64
	bun build --compile --target=bun-darwin-x64 packages/cli/src/index.ts --outfile dist/cli/todu-cli-darwin-x64
	bun build --compile --target=bun-darwin-arm64 packages/cli/src/index.ts --outfile dist/cli/todu-cli-darwin-arm64
	bun build --compile --target=bun-windows-x64-baseline packages/cli/src/index.ts --outfile dist/cli/todu-cli-windows-x64.exe
	@echo "Built all CLI binaries:"
	@ls -lh dist/cli/

# =============================================================================
# Development
# =============================================================================

run: ## Run CLI (usage: make run ARGS="task list")
	node packages/cli/dist/index.js $(ARGS)

# =============================================================================
# Electron
# =============================================================================

dev-electron: ## Launch Electron app in dev mode (hot reload)
	npm run --workspace=packages/electron dev

build-electron: ## Build Electron app for distribution
	npm run --workspace=packages/electron build

# =============================================================================
# Distribution
# =============================================================================

dist: build build-electron build-cli-binary ## Build installer for current platform
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

dev-status: ## Check if dev environment is running
	@echo "n/a"
