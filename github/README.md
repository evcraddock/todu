# GitHub Task Management Plugin

Claude Code plugin for managing GitHub issues with rich git context.

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

- Fetch issue details from GitHub
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

### Update an Issue

```text
User: "Close issue #42"
User: "Mark issue #42 as high priority"
```

Claude will:

- Update issue status (open/closed)
- Change priority or labels
- Sync updated issue to cache
- Display confirmation

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

Issues are cached in: `~/.local/todu/issues/`

Format: Normalized JSON (same across GitHub, Forgejo, Todoist plugins)

File naming: `github-{repo}-{issue_number}.json`

## Scripts

The plugin includes Python scripts with PEP 723 inline dependencies:

- `scripts/create-issue.py` - Create GitHub issue
- `scripts/view-issue.py` - View issue details with comments
- `scripts/create-comment.py` - Add comment to issue
- `scripts/update-issue.py` - Update issue status/priority
- `scripts/sync-issues.py` - Sync issues to cache

Note: Issue searching uses the unified `core/scripts/list-items.py` which searches across all systems.

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
