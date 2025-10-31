# Forgejo Task Management Plugin

Claude Code plugin for managing Forgejo/Gitea issues with rich git context.

## Features

- **Create Issues**: Automatically include current branch, commits, and file context
- **View Issues**: Display detailed issue information with all comments
- **Add Comments**: Comment on existing issues
- **Update Issues**: Change status, priority, or close issues
- **Sync Issues**: Cache issues locally for fast access
- **Search Issues**: Query cached issues without API calls

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

- **Forgejo Token** (Required): Set `FORGEJO_TOKEN` environment variable with a personal access token
  - Create token in Forgejo at: Settings > Applications > Generate New Token
  - Required scopes: `read:issue`, `write:issue`
- **Forgejo Base URL**: The plugin auto-detects from git remote
  - The plugin automatically detects the Forgejo URL from the git remote in the current directory
  - You must run the plugin from within a git repository that has a Forgejo remote

## Usage

The plugin provides autonomous skills that Claude invokes based on context:

### Create an Issue

```text
User: "Create an issue for this authentication bug"
```

Claude will:

- Extract current branch and recent commits
- Prompt for title and description
- Ask about labels
- Create the issue with git context

### View an Issue

```text
User: "Show me issue #42"
```

Claude will:

- Fetch issue details from Forgejo
- Display title, description, status, and labels
- Show all comments with authors and timestamps
- Include direct link to issue

### Add a Comment

```text
User: "Add a comment to issue #42 saying the fix is deployed"
```

Claude will:

- Prompt for comment text if not provided
- Post comment to the issue
- Display confirmation with comment URL

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

Issues are cached in: `~/.local/todu/items/`

Format: Normalized JSON (same across GitHub, Forgejo, Todoist plugins)

File naming: `forgejo-{repo}-{issue_number}.json`

## Scripts

The plugin includes Python scripts with PEP 723 inline dependencies:

- `scripts/create-issue.py` - Create Forgejo issue
- `scripts/view-issue.py` - View issue details with comments
- `scripts/create-comment.py` - Add comment to issue
- `scripts/update-issue.py` - Update issue status/priority
- `scripts/sync-issues.py` - Sync issues to cache

Note: Issue searching uses the unified `core/scripts/list-items.py` which searches across all systems.

Scripts can be run manually if needed:

```bash
# Using absolute path
~/.claude/plugins/marketplaces/todu/forgejo/scripts/create-issue.py \
  --repo owner/name --title "Bug fix" --body "Description"

# Using relative path (from todu project root)
./forgejo/scripts/create-issue.py \
  --repo owner/name --title "Bug fix" --body "Description"
```

## Troubleshooting

**"FORGEJO_TOKEN not set"**

```bash
export FORGEJO_TOKEN=your_token_here
export FORGEJO_URL=https://forgejo.example.com
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
