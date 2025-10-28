# GitHub Task Management Plugin

Claude Code plugin for managing GitHub issues with rich git context.

## Features

- **Create Issues**: Automatically include current branch, commits, and file context
- **Sync Issues**: Cache issues locally for fast access
- **Search Issues**: Query cached issues without API calls

## Installation

1. Add the todu marketplace to Claude Code:

   ```bash
   claude plugin marketplace add your-org/todu
   ```

2. Install the GitHub plugin:

   ```bash
   claude plugin install github@todu
   ```

3. The plugin will automatically install `uv` (Python package manager) on first use if not already installed.

## Prerequisites

- **GitHub Token**: Set `GITHUB_TOKEN` environment variable with a personal access token
  - Create token at: <https://github.com/settings/tokens>
  - Required scopes: `repo` (for private repos) or `public_repo` (for public only)

## Usage

The plugin provides three autonomous skills that Claude invokes based on context:

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
User: "Sync my GitHub issues"
```

Claude will:

- Detect repo from git remote
- Download all issues
- Store locally in `~/.local/todu/github/`
- Report sync statistics

### Search Issues

```text
User: "Show me my open bugs"
```

Claude will:

- Query local cache (fast, no API calls)
- Filter by status, labels, assignee
- Display results with links

## Local Storage

Issues are cached in: `~/.local/todu/github/issues/`

Format: Normalized JSON (same across GitHub, Forgejo, Todoist plugins)

## Scripts

The plugin includes Python scripts with PEP 723 inline dependencies:

- `scripts/create-issue.py` - Create GitHub issue
- `scripts/sync-issues.py` - Sync issues to cache
- `scripts/list-issues.py` - Query cached issues

Scripts can be run manually if needed:

```bash
# Using absolute path
~/.claude/plugins/marketplaces/todu/github/scripts/create-issue.py \
  --repo owner/name --title "Bug fix" --body "Description"

# Using relative path (from todu project root)
./github/scripts/create-issue.py \
  --repo owner/name --title "Bug fix" --body "Description"
```

## Troubleshooting

**"GITHUB_TOKEN not set"**

```bash
export GITHUB_TOKEN=your_token_here
```

**"uv not found"**
The SessionStart hook should auto-install. If it fails:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

**"No cached issues"**
Run sync first:

```text
User: "Sync GitHub issues"
```

## License

MIT
