.PHONY: dev dev-stop dev-status dev-logs dev-tail build test lint lint-fix format format-check typecheck check pre-pr run help

SOCKET := ./.overmind.sock

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

# =============================================================================
# Build & Test
# =============================================================================

build: ## Build all packages
	bun run build

test: ## Run tests
	bun test

lint: ## Run linter
	bun run lint

lint-fix: ## Run linter with auto-fix
	bun run lint:fix

format: ## Format code
	bun run format

format-check: ## Check code formatting
	bun run format:check

typecheck: ## Run TypeScript type checking
	bun run typecheck

check: ## Run linting and tests
	bun run lint && bun test

pre-pr: ## Run pre-PR checks
	./scripts/pre-pr.sh

# =============================================================================
# Development
# =============================================================================

run: ## Run CLI command (usage: make run ARGS="task list")
	bun run packages/app/src/index.ts $(ARGS)

# Placeholder until Phase 2 (Electron) when we have background services
dev: ## Start dev environment
	@echo "No dev services configured yet. See Procfile.dev for Phase 2+."
	@echo "For CLI development, use: make run ARGS=\"--help\""

dev-status: ## Check if dev environment is running
	@echo "n/a"

dev-stop: ## Stop dev environment
	@echo "No dev services running."

dev-logs: ## Stream dev logs
	@echo "No dev services configured."

dev-tail: ## Show recent dev logs
	@echo "No dev services configured."

# =============================================================================
# Overmind commands (uncomment in Phase 2 when Procfile.dev has services)
# =============================================================================

# dev: ## Start the dev environment (daemonized)
# 	@if [ -S $(SOCKET) ] && overmind ps -s $(SOCKET) > /dev/null 2>&1; then \
# 		echo "Dev environment already running"; \
# 		overmind ps -s $(SOCKET); \
# 	else \
# 		rm -f $(SOCKET); \
# 		overmind start -f Procfile.dev -s $(SOCKET) -D; \
# 		sleep 2; \
# 		overmind ps -s $(SOCKET); \
# 	fi

# dev-stop: ## Stop the dev environment
# 	@if [ -S $(SOCKET) ]; then overmind quit -s $(SOCKET) || true; fi
# 	@rm -f $(SOCKET)
# 	@tmux list-sessions 2>/dev/null | grep overmind | cut -d: -f1 | xargs -r -n1 tmux kill-session -t 2>/dev/null || true

# dev-status: ## Check if dev environment is running
# 	@if [ -S $(SOCKET) ] && overmind ps -s $(SOCKET) > /dev/null 2>&1; then \
# 		echo "running"; \
# 	else \
# 		echo "stopped"; \
# 	fi

# dev-logs: ## Stream all logs (Ctrl+C to stop)
# 	overmind echo -s $(SOCKET)

# dev-tail: ## Show last 100 lines of logs (non-blocking)
# 	@if [ -S $(SOCKET) ]; then \
# 		for pane in $$(tmux -S $(SOCKET) list-panes -a -F '#{pane_id}' 2>/dev/null); do \
# 			tmux -S $(SOCKET) capture-pane -p -t "$$pane" -S -100 2>/dev/null; \
# 		done; \
# 	else \
# 		echo "Dev environment not running"; \
# 	fi

# connect-app: ## Connect to app terminal
# 	overmind connect -s $(SOCKET) app
