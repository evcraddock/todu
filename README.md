# Todu - Task Management for Claude Code

A collection of Claude Code plugins for unified task management across GitHub, Forgejo, and Todoist.

## Overview

Todu provides seamless task management integration for Claude Code through autonomous skills that Claude invokes based on context. Each plugin normalizes task data to a common format and caches it locally for fast, offline access.

## Installation

### 1. Add the Todu Marketplace

```bash
/plugin marketplace add evcraddock/todu
```

### 2. Install Plugins

Install one or more plugins based on your needs:

```bash
# GitHub
/plugin install github@todu

# Forgejo
/plugin install forgejo@todu

# Todoist
/plugin install todoist@todu
```

## Available Plugins

### GitHub Plugin

Manage GitHub issues with rich git context including branches, commits, and file changes.

- Create issues with automatic context extraction
- View issues with full details and comments
- Add comments to issues
- Update issue status and priority
- Sync issues to local cache
- Search and filter cached issues

**Authentication:**

```bash
export GITHUB_TOKEN="your_github_token"
```

Create a token at: <https://github.com/settings/tokens>

[View GitHub Plugin Documentation](./github/README.md)

### Forgejo Plugin

Manage Forgejo/Gitea issues with the same capabilities as GitHub.

- Create issues with automatic context extraction
- View issues with full details and comments
- Add comments to issues
- Update issue status and priority
- Sync issues to local cache
- Search and filter cached issues
- Works with self-hosted Forgejo and Gitea instances
- Automatically detects Forgejo remotes

**Authentication:**

```bash
export FORGEJO_TOKEN="your_forgejo_token"
```

Also install the `fj` CLI: <https://code.forgejo.org/forgejo/cli>

[View Forgejo Plugin Documentation](./forgejo/README.md)

### Todoist Plugin

Manage personal tasks in Todoist with priority and status tracking.

- Create tasks with optional git context
- View tasks with full details and comments
- Add comments to tasks
- Update task status and priority
- Priority mapping (low/medium/high)
- Status tracking via labels (open, in-progress, done, canceled)
- Sync tasks to local cache
- Search and filter cached tasks

**Authentication:**

```bash
export TODOIST_TOKEN="your_todoist_token"
```

Create a token at: <https://todoist.com/app/settings/integrations/developer>

[View Todoist Plugin Documentation](./todoist/README.md)

## Usage

All plugins provide autonomous skills that Claude invokes automatically based on context. No slash commands to remember!

### Creating Tasks

```text
# In a GitHub repository
"Create an issue for the authentication bug I'm working on"

# In a Forgejo repository
"Create a Forgejo issue to track this refactoring"

# Personal task
"Create a Todoist task to research meditation"
```

### Viewing Tasks

```text
"Show me GitHub issue #42"
"View Todoist task 12345678"
"Display Forgejo issue #5 with comments"
```

### Adding Comments

```text
"Add a comment to issue #42 saying the fix is deployed"
"Comment on task 12345678 with my progress update"
```

### Updating Tasks

```text
"Close issue #42"
"Mark Todoist task 12345678 as high priority"
"Set Forgejo issue #5 to in-progress"
```

### Syncing Tasks

```text
"Sync my GitHub issues"
"Sync Todoist tasks"
```

### Searching Tasks

```text
"List my open GitHub issues"
"Show high priority Todoist tasks"
"Find Forgejo issues with the bug label"
```

## Features

### Automatic Context Extraction

When creating tasks in a git repository, plugins automatically include:

- Current branch name
- Recent commits
- Modified files
- Repository information

### Local Caching

All plugins cache tasks locally in `~/.local/todu/` for:

- Fast, offline access
- No API rate limits when searching
- Consistent data format across systems

## Requirements

- Claude Code
- Python 3.9+ (automatically managed by `uv`)
- `uv` package manager (auto-installed on first use)

## License

MIT License - see [LICENSE](./LICENSE) for details

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
