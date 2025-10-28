# Forgejo Task Management Plugin

Claude Code plugin for managing Forgejo/Gitea issues with rich git context.

## Features

- **Create Issues**: Automatically include current branch, commits, and file context
- **Sync Issues**: Cache issues locally for fast access
- **Search Issues**: Query cached issues without API calls
- **Update Issues**: Change status, priority, or close issues

## Installation

1. Add the todu marketplace to Claude Code:

   ```bash
   claude plugin marketplace add your-org/todu
   ```

2. Install the Forgejo plugin:

   ```bash
   claude plugin install forgejo@todu
   ```

3. The plugin will automatically install `uv` (Python package manager) on first use if not already installed.

## Prerequisites

- **Forgejo Token**: Set `FORGEJO_TOKEN` environment variable with a personal access token
  - Create token in Forgejo at: Settings > Applications > Generate New Token
  - Required scopes: `read:issue`, `write:issue`
- **Forgejo Base URL**: Set `FORGEJO_URL` environment variable with your Forgejo instance URL
  - Example: `export FORGEJO_URL=https://forgejo.caradoc.com`

## Usage

The plugin provides four autonomous skills that Claude invokes based on context:

### Create an Issue

```text
User: "Create an issue for this authentication bug"
```

Claude will:

- Extract current branch and recent commits
- Prompt for title and description
- Ask about labels
- Create the issue with git context

### Sync Issues

```text
User: "Sync my Forgejo issues"
```

Claude will:

- Detect repo from git remote
- Download all issues
- Store locally in `~/.local/todu/forgejo/`
- Report sync statistics

### Search Issues

```text
User: "Show me my open bugs"
```

Claude will:

- Query local cache (fast, no API calls)
- Filter by status, labels, assignee
- Display results with links

### Update Issues

```text
User: "Mark issue #3 as in progress"
```

Claude will:

- Update issue status to in-progress
- Sync updated issue to cache
- Display confirmation

## Local Storage

Issues are cached in: `~/.local/todu/forgejo/issues/`

Format: Normalized JSON (same across GitHub, Forgejo, Todoist plugins)

## Scripts

The plugin includes Python scripts with PEP 723 inline dependencies:

- `scripts/create-issue.py` - Create Forgejo issue
- `scripts/sync-issues.py` - Sync issues to cache
- `scripts/list-issues.py` - Query cached issues
- `scripts/update-issue.py` - Update issue status/priority

Scripts can be run manually if needed:

```bash
cd forgejo
./scripts/create-issue.py --repo owner/name --title "Bug fix" --body "Description"
```

## Troubleshooting

**"FORGEJO_TOKEN not set"**

```bash
export FORGEJO_TOKEN=your_token_here
export FORGEJO_URL=https://forgejo.caradoc.com
```

**"uv not found"**
The SessionStart hook should auto-install. If it fails:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

**"No cached issues"**
Run sync first:

```text
User: "Sync Forgejo issues"
```

## License

MIT
