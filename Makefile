.PHONY: help install dev test lint typecheck build clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies
	bun install

dev: ## Run all services in dev mode (requires overmind)
	overmind start -f Procfile.dev

dev-cli: ## Run CLI in dev mode
	bun run dev:cli

dev-electron: ## Run Electron in dev mode
	bun run dev:electron

dev-sync: ## Run sync server in dev mode
	bun run dev:sync

test: ## Run all tests
	bun test

test-core: ## Run core package tests
	bun test --cwd packages/core

test-cli: ## Run CLI tests
	bun test --cwd packages/cli

lint: ## Run linter
	bun run lint

lint-fix: ## Run linter with auto-fix
	bun run lint:fix

typecheck: ## Run type checker
	bun run typecheck

format: ## Format code
	bun run format

build: ## Build all packages
	bun run build

build-core: ## Build core package
	bun run build:core

build-cli: ## Build CLI
	bun run build:cli

clean: ## Clean build artifacts
	rm -rf packages/*/dist
	rm -rf node_modules

pre-pr: ## Run all checks before PR
	bun run pre-pr
