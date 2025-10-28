---
name: todoist-task-sync
description: MANDATORY skill for syncing Todoist tasks. NEVER call scripts/sync-tasks.py directly - ALWAYS use this skill via the Skill tool. Use when user wants to sync Todoist tasks. (plugin:todoist@todu)
---

# Sync Todoist Tasks

**⚠️ MANDATORY: ALWAYS invoke this skill via the Skill tool for EVERY sync request.**

**NEVER EVER call `sync-tasks.py` directly. This skill provides essential logic beyond just running the script:**

- Determining sync scope (all tasks, specific project, single task)
- Prompting for project selection if ambiguous
- Handling sync modes (full vs. single task)
- Reporting sync statistics
- Error handling and retry logic

Even if you've invoked this skill before in the conversation, you MUST invoke it again for each new sync request.

---

This skill syncs Todoist tasks to local cache for offline searching and filtering.

## When to Use

- User explicitly mentions syncing Todoist tasks
- User asks to "refresh", "update", or "fetch" Todoist tasks
- Automatically after creating or updating a task (background sync)
- Before searching if cache is stale or empty

## What This Skill Does

1. **Determine Sync Scope**
   - Full sync: All active tasks across all projects
   - Project sync: All tasks in a specific project
   - Single task sync: One specific task (usually after create/update)

2. **Execute Sync**
   - Call `$PLUGIN_DIR/scripts/sync-tasks.py` with appropriate parameters
   - Script fetches tasks from Todoist API
   - Normalizes and caches tasks locally in `~/.local/todu/todoist/tasks/`
   - Updates sync metadata in `~/.local/todu/todoist/sync.json`

3. **Report Results**
   - Display sync statistics: new, updated, total
   - Show timestamp of last sync
   - Indicate any errors or warnings

## Example Interactions

**User**: "Sync my Todoist tasks"
**Skill**:

- Determines: Full sync (no project specified)
- Calls: `sync-tasks.py`
- Receives: `{"synced": 42, "new": 5, "updated": 37, "timestamp": "..."}`
- Shows: "✅ Synced 42 tasks (5 new, 37 updated)"

**User**: "Sync tasks from my Work project"
**Skill**:

- Prompts: "What's the project ID?" (or looks up from user's projects)
- User: "2203306141"
- Calls: `sync-tasks.py --project-id 2203306141`
- Shows: "✅ Synced 15 tasks from Work project"

**User**: "Refresh task 12345678"
**Skill**:

- Determines: Single task sync
- Calls: `sync-tasks.py --task-id 12345678`
- Shows: "✅ Synced task 12345678"

## Script Interface

```bash
cd $PLUGIN_DIR

# Full sync (all active tasks)
./scripts/sync-tasks.py

# Project sync
./scripts/sync-tasks.py --project-id "2203306141"

# Single task sync
./scripts/sync-tasks.py --task-id "12345678"
```

Returns JSON:

```json
{
  "synced": 42,
  "new": 5,
  "updated": 37,
  "timestamp": "2025-10-28T10:30:00Z"
}
```

## Environment Variables

- `TODOIST_TOKEN` (required): Personal API token

## Cache Structure

- Tasks cached in: `~/.local/todu/todoist/tasks/{task-id}.json`
- Sync metadata: `~/.local/todu/todoist/sync.json`
- Each task file contains normalized JSON format

## Notes

- Todoist API returns only active (non-completed) tasks by default
- To see completed tasks, they must be synced while still active
- Sync is fast (usually < 1 second for typical task counts)
- Background syncs happen automatically after create/update operations
- Project IDs can be found in Todoist URL when viewing a project
