.PHONY: dev dev-stop dev-status dev-logs dev-tail check pre-pr help

SOCKET := ./.overmind.sock

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

dev: ## Start the dev environment (daemonized)
	@if [ -S $(SOCKET) ] && overmind ps -s $(SOCKET) > /dev/null 2>&1; then \
		echo "Dev environment already running"; \
		overmind ps -s $(SOCKET); \
	else \
		rm -f $(SOCKET); \
		overmind start -f Procfile.dev -s $(SOCKET) -D; \
		sleep 2; \
		overmind ps -s $(SOCKET); \
	fi

dev-stop: ## Stop the dev environment
	@if [ -S $(SOCKET) ]; then overmind quit -s $(SOCKET) || true; fi
	@rm -f $(SOCKET)
	@tmux list-sessions 2>/dev/null | grep overmind | cut -d: -f1 | xargs -r -n1 tmux kill-session -t 2>/dev/null || true

dev-status: ## Check if dev environment is running
	@if [ -S $(SOCKET) ] && overmind ps -s $(SOCKET) > /dev/null 2>&1; then \
		echo "running"; \
	else \
		echo "stopped"; \
	fi

dev-logs: ## Stream all logs (Ctrl+C to stop)
	overmind echo -s $(SOCKET)

dev-tail: ## Show last 100 lines of logs (non-blocking)
	@if [ -S $(SOCKET) ]; then \
		for pane in $$(tmux -S $(SOCKET) list-panes -a -F '#{pane_id}' 2>/dev/null); do \
			tmux -S $(SOCKET) capture-pane -p -t "$$pane" -S -100 2>/dev/null; \
		done; \
	else \
		echo "Dev environment not running"; \
	fi

check: ## Run linting and tests
	bun run lint && bun test

pre-pr: ## Run pre-PR checks
	./scripts/pre-pr.sh

# Connect to specific service terminal (replace 'app' with service name from Procfile.dev)
# connect-app: ## Connect to app terminal
# 	overmind connect -s $(SOCKET) app
