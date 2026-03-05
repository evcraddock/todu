.PHONY: build test test-sync-server-integration check check-ci typecheck pre-pr run clean help dev dev-stop dev-status dev-logs dev-tail dev-electron build-electron build-cli-binary build-cli-binaries dist dist-linux dist-mac dist-win install version version-check node_modules check-bun

SOCKET    := ./.overmind.sock
DEV_CONFIG := $(abspath .dev/config.yaml)
DEV_DAEMON_SOCKET := $(abspath .dev/data/daemon.sock)

# =============================================================================
# Dependency checks
# =============================================================================

node_modules: ## Install dependencies if missing
	@if [ ! -d node_modules ]; then \
		echo "node_modules not found. Running npm install..."; \
		npm install; \
	fi

check-bun: ## Verify bun is installed (needed for CLI binary builds)
	@command -v bun >/dev/null 2>&1 || test -x "$$HOME/.bun/bin/bun" || { echo "❌ bun is required for CLI binary builds. Install from https://bun.sh"; exit 1; }

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

# =============================================================================
# Build & Quality
# =============================================================================

build: node_modules ## Build all packages (core → engine → recurring-worker → daemon → cli)
	npm run build

test: node_modules ## Run default tests (sync-server integration tests are excluded)
	npm test

test-sync-server-integration: node_modules ## Run sync-server-backed integration tests
	npm run test:sync-server-integration

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
	@TODUAI_CONFIG=$(DEV_CONFIG) node packages/cli/dist/index.js $(ARGS)

dev: node_modules ## Start dev environment (daemon + local sync server via overmind)
	@if overmind ps -s $(SOCKET) >/dev/null 2>&1; then \
		echo "Dev environment already running."; \
	else \
		pids=$$(ps -eo pid=,args= | grep 'packages/daemon/src/entrypoint.ts' | grep -v grep | awk '{print $$1}'); \
		if [ -n "$$pids" ]; then \
			kill $$pids 2>/dev/null || true; \
		fi; \
		rm -f $(DEV_DAEMON_SOCKET); \
		TODUAI_CONFIG=$(DEV_CONFIG) overmind start -D -s $(SOCKET) --can-die sync-server; \
	fi
	@for i in $$(seq 1 150); do \
		if [ -S "$(DEV_DAEMON_SOCKET)" ]; then \
			exit 0; \
		fi; \
		sleep 0.2; \
	done; \
	echo "Timed out waiting for daemon socket (30s): $(DEV_DAEMON_SOCKET)"; \
	if overmind ps -s $(SOCKET) >/dev/null 2>&1; then \
		overmind ps -s $(SOCKET) || true; \
		echo "Use 'make dev-logs' to inspect daemon startup errors."; \
	else \
		echo "Overmind is not reachable at $(SOCKET)."; \
	fi; \
	exit 1

dev-stop: ## Stop dev environment
	overmind quit -s $(SOCKET) 2>/dev/null || true
	@pids=$$(ps -eo pid=,args= | grep 'packages/daemon/src/entrypoint.ts' | grep -v grep | awk '{print $$1}'); \
	if [ -n "$$pids" ]; then \
		kill $$pids 2>/dev/null || true; \
	fi
	rm -f $(SOCKET)
	rm -f $(DEV_DAEMON_SOCKET)

dev-status: ## Check if dev environment is healthy (outputs: running | stopped)
	@if [ -S "$(DEV_DAEMON_SOCKET)" ] && ps -eo args= | grep -q '[p]ackages/daemon/src/entrypoint.ts'; then \
		echo "running"; \
	else \
		echo "stopped"; \
	fi

dev-logs: ## Connect to overmind session (interactive)
	@if [ -t 0 ] && [ -t 1 ]; then \
		if overmind ps -s $(SOCKET) >/dev/null 2>&1; then \
			overmind connect -s $(SOCKET); \
		else \
			tmux_socket=$$(ls -1t /tmp/tmux-$$(id -u)/overmind-todu-* 2>/dev/null | head -n1); \
			if [ -n "$$tmux_socket" ] && tmux -S "$$tmux_socket" has-session -t todu >/dev/null 2>&1; then \
				echo "Overmind socket unavailable; attaching directly via tmux socket: $$tmux_socket"; \
				tmux -S "$$tmux_socket" attach -t todu; \
			else \
				echo "Dev environment is not running. Start it with: make dev"; \
				exit 1; \
			fi; \
		fi; \
	else \
		echo "make dev-logs requires an interactive terminal. Use make dev-tail for non-interactive log output."; \
		exit 1; \
	fi

dev-tail: ## Show last 100 lines of dev logs (non-blocking)
	@timeout 2 overmind echo -s $(SOCKET) 2>/dev/null | tail -100 || true

# =============================================================================
# Electron
# =============================================================================

dev-electron: node_modules ## Launch Electron app in dev mode (hot reload)
	TODUAI_CONFIG=$(DEV_CONFIG) npm run --workspace=packages/electron dev

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

install: ## Install toduai (detects OS: Linux = AppImage, macOS = .dmg)
	@case "$$(uname -s)" in \
	  Linux)  bash scripts/install-linux.sh ;; \
	  Darwin) bash scripts/install-mac.sh ;; \
	  *)      echo "error: unsupported OS: $$(uname -s)"; exit 1 ;; \
	esac

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


