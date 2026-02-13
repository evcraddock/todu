.PHONY: build test check check-ci typecheck pre-pr run clean help dev-electron build-electron

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
	rm -rf packages/*/dist packages/*/*.tsbuildinfo

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

dev-status: ## Check if dev environment is running
	@echo "n/a"
