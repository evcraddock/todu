# Todoist Plugin for Todu

Personal task management with Todoist integration for Claude Code. Create, sync, search, and update Todoist tasks with optional git context.

## Features

- **Create Tasks**: Create Todoist tasks with optional git context (branch, commits, files)
- **Sync Tasks**: Sync tasks to local cache for fast, offline searching
- **Search Tasks**: Search cached tasks with filters (project, status, priority, labels)
- **Update Tasks**: Update task status, priority, or mark as complete/canceled
- **Normalized Format**: Consistent JSON format across all task systems (GitHub, Forgejo, Todoist)

## Installation

### Prerequisites

1. **Todoist API Token** (required)
   - Go to: <https://todoist.com/app/settings/integrations/developer>
   - Click "Create new token"
   - Copy the token

2. **Set Environment Variable**

   ```bash
   export TODOIST_TOKEN="your-token-here"
   ```

   Add to your `~/.zshrc` or `~/.bashrc` for persistence:

   ```bash
   echo 'export TODOIST_TOKEN="your-token-here"' >> ~/.zshrc
   ```

3. **Install Plugin**

   The plugin auto-installs `uv` (Python package manager) on first use if not already present.

## Usage

### Create a Task

```text
User: "Create a Todoist task to review the PR"
Claude: [Invokes todoist-task-create skill]
  - Prompts for title, description, project, priority, due date
  - Optionally includes git context if in a repo
  - Creates task and displays confirmation with URL
```

**Example with git context:**

```text
User: "Create a task for this bug fix"
Claude: [Extracts git context: branch, commits, files]
  Title: "Complete authentication timeout fix"
  Description: "Branch: fix/auth-timeout
  Recent commits:
  - abc123 Fix timeout handling
  - def456 Add retry logic"
  Project: Work
  Priority: high
  Due: tomorrow
✅ Created: https://todoist.com/app/task/12345678
```

### Sync Tasks

```text
User: "Sync my Todoist tasks"
Claude: [Invokes todoist-task-sync skill]
✅ Synced 42 tasks (5 new, 37 updated)
```

**Project-specific sync:**

```text
User: "Sync tasks from my Work project"
Claude: What's the Work project ID?
User: "2203306141"
✅ Synced 15 tasks from Work project
```

### Search Tasks

```text
User: "Show me my high priority tasks"
Claude: [Invokes todoist-task-search skill]
Found 3 high priority task(s):

**Review authentication PR** (due: 2025-10-29)
  Labels: priority:high, review
  Status: open
  URL: https://todoist.com/app/task/12345678

**Complete database migration**
  Labels: priority:high
  Status: open
  URL: https://todoist.com/app/task/87654321
...
```

**Filter by project and status:**

```text
User: "What open tasks do I have in my Work project?"
Claude: [Applies filters: project + status:open]
```

### Update Tasks

```text
User: "Mark task 12345678 as done"
Claude: [Invokes todoist-task-update skill]
✅ Marked task 12345678 as completed
```

**Update priority:**

```text
User: "Set my auth fix task to high priority"
Claude: [Searches for "auth fix", finds task]
✅ Updated task priority to high
```

**Cancel a task:**

```text
User: "Cancel the code review task"
Claude: [Searches for "code review"]
✅ Canceled task and marked as completed
```

## Skills

The plugin provides four skills that Claude Code automatically invokes:

- **todoist-task-create**: Create personal tasks with optional git context
- **todoist-task-sync**: Sync tasks to local cache
- **todoist-task-search**: Search cached tasks with filters
- **todoist-task-update**: Update task status, priority, or completion

Skills are invoked automatically based on user intent. You never need to call them directly.

## Local Storage

Tasks are cached locally for fast, offline searching:

- **Tasks**: `~/.local/todu/todoist/tasks/{task-id}.json`
- **Sync metadata**: `~/.local/todu/todoist/sync.json`

Each task is stored in normalized JSON format compatible with GitHub and Forgejo plugins.

## Normalized Task Format

All tasks use a consistent format:

```json
{
  "id": "12345678",
  "system": "todoist",
  "type": "task",
  "title": "Review authentication PR",
  "description": "Check security implications...",
  "status": "open",
  "url": "https://todoist.com/app/task/12345678",
  "createdAt": "2025-10-28T10:30:00Z",
  "updatedAt": "2025-10-28T10:30:00Z",
  "labels": ["priority:high", "review"],
  "assignees": [],
  "systemData": {
    "project_id": "2203306141",
    "priority": 4,
    "due": "2025-10-29",
    "is_completed": false
  }
}
```

## Priority Mapping

Todoist uses numeric priorities (1-4). The plugin maps them to standard labels:

- **Priority 4** (Urgent) → `priority:high`
- **Priority 3** (High) → `priority:medium`
- **Priority 2** (Medium) → `priority:low`
- **Priority 1** (Normal) → no priority label

## Status Mapping

Status is managed via labels since Todoist doesn't have a built-in status field:

- **open** → Active task (not completed)
- **closed** → Completed task
- **status:backlog** → Task label for backlog
- **status:in-progress** → Task label for in-progress
- **status:done** → Task label for done (also completes the task)
- **status:canceled** → Task label for canceled (also completes the task)

## Due Dates

Todoist supports natural language due dates:

- "tomorrow"
- "next week"
- "Dec 25"
- "in 3 days"
- "next Monday"

## Project IDs

Project IDs are long numbers (e.g., "2203306141"). You can find them:

1. Go to Todoist web app
2. Click on a project
3. Look at the URL: `https://todoist.com/app/project/2203306141`
4. The number at the end is the project ID

## Git Context Integration

When in a git repository, the plugin can include git context in task descriptions:

- **Repository name** (from git remote)
- **Current branch**
- **Recent commits** on the branch
- **Modified files**

This is **optional** for Todoist (unlike GitHub/Forgejo) since personal tasks may not be code-related.

## Troubleshooting

### "TODOIST_TOKEN environment variable not set"

Set your API token:

```bash
export TODOIST_TOKEN="your-token-here"
```

### "No cached tasks found. Run sync first."

Sync your tasks before searching:

```text
User: "Sync my Todoist tasks"
```

### "Failed to fetch task"

- Verify your TODOIST_TOKEN is correct
- Check internet connection
- Ensure task ID is valid

### uv Installation Issues

The plugin auto-installs `uv` on first use. If this fails:

```bash
# Manual installation
curl -LsSf https://astral.sh/uv/install.sh | sh

# Verify
uv --version
```

## API Rate Limits

Todoist API has generous rate limits:

- **450 requests per 15 minutes** (free tier)
- **900 requests per 15 minutes** (premium tier)

Normal usage stays well within these limits. Background syncs happen automatically after create/update operations.

## Privacy & Security

- API token stored in environment variable (not in plugin files)
- Tasks cached locally on your machine
- No data sent to third parties
- Cache files are regular JSON (inspect anytime)

## Differences from GitHub/Forgejo Plugins

| Feature | GitHub/Forgejo | Todoist |
|---------|----------------|---------|
| System type | Issue tracker | Personal task manager |
| Git context | Required | Optional |
| Assignees | Multiple | None (personal) |
| Repository detection | From git remote | N/A |
| Project selection | Automatic | Manual |
| Due dates | Milestones | Natural language |

## Examples

### Full Workflow Example

```text
1. Create task with git context:
   User: "Create a task for the auth bug I'm working on"
   Claude: [Extracts branch, commits] Creates task with context

2. Sync all tasks:
   User: "Sync my Todoist"
   Claude: ✅ Synced 42 tasks

3. Search for specific tasks:
   User: "Show me high priority tasks"
   Claude: [Lists 3 high priority tasks]

4. Update a task:
   User: "Mark task 12345678 as done"
   Claude: ✅ Task completed

5. Search again:
   User: "Show open tasks"
   Claude: [Lists remaining open tasks]
```

## Dependencies

- **Python**: >=3.9 (usually pre-installed on macOS/Linux)
- **uv**: Auto-installed on first use
- **todoist-api-python**: >=2.1.0 (installed via PEP 723 inline dependencies)

## License

See repository license.

## Related

- [GitHub Plugin](../github/README.md)
- [Forgejo Plugin](../forgejo/README.md)
- [Todu Design](../DESIGN.md)
