---
name: todoist-task-search
description: MANDATORY skill for searching Todoist tasks. NEVER call scripts/list-tasks.py directly - ALWAYS use this skill via the Skill tool. Use when user wants to find, list, show, or search Todoist tasks. (plugin:todoist@todu)
---

# Search Todoist Tasks

**⚠️ MANDATORY: ALWAYS invoke this skill via the Skill tool for EVERY search request.**

**NEVER EVER call `list-tasks.py` directly. This skill provides essential logic beyond just running the script:**

- Parsing natural language search queries
- Determining appropriate filters (project, status, priority, labels)
- Checking cache freshness and triggering sync if needed
- Formatting results for readable display
- Handling interactive refinement of search

Even if you've invoked this skill before in the conversation, you MUST invoke it again for each new search request.

---

This skill searches Todoist tasks from local cache with rich filtering capabilities.

## When to Use

- User wants to find, list, show, or search Todoist tasks
- User asks "what tasks...", "show me tasks...", "find tasks..."
- User mentions filtering by project, priority, status, or labels
- User wants to see their task list

## What This Skill Does

1. **Check Cache**
   - Verify local cache exists and is reasonably fresh
   - If cache is missing or very stale (>1 hour), trigger sync first
   - Inform user about cache age if relevant

2. **Parse Search Criteria**
   - Extract filters from user's natural language query
   - Project filter: specific project ID or name
   - Status filter: open, closed
   - Priority filter: low, medium, high
   - Labels filter: any custom labels
   - Support combinations of filters

3. **Execute Search**
   - Call `$PLUGIN_DIR/scripts/list-tasks.py` with appropriate filters
   - Script reads from local cache and applies filters
   - Returns filtered results in JSON or markdown format

4. **Display Results**
   - Format results in readable way
   - Show task count, titles, priorities, due dates, URLs
   - Offer to refine search if results are too broad or too narrow

## Example Interactions

**User**: "Show me all my Todoist tasks"
**Skill**:

- Checks cache (last synced 15 minutes ago, acceptable)
- Calls: `list-tasks.py --format markdown`
- Displays: List of all tasks with titles, labels, due dates, URLs

**User**: "Find high priority tasks"
**Skill**:

- Parses: priority filter = high
- Calls: `list-tasks.py --priority high --format markdown`
- Shows: "Found 3 high priority task(s):" + details

**User**: "What open tasks do I have in my Work project?"
**Skill**:

- Prompts: "What's the Work project ID?" (or looks up if known)
- User: "2203306141"
- Calls: `list-tasks.py --project-id 2203306141 --status open --format markdown`
- Displays: Filtered task list

**User**: "Show tasks with the 'bug' label"
**Skill**:

- Parses: labels filter = bug
- Calls: `list-tasks.py --labels bug --format markdown`
- Shows: Tasks tagged with 'bug'

## Script Interface

```bash
cd $PLUGIN_DIR

# All tasks
./scripts/list-tasks.py --format markdown

# Filter by project
./scripts/list-tasks.py --project-id "2203306141" --format markdown

# Filter by status
./scripts/list-tasks.py --status open --format markdown

# Filter by priority
./scripts/list-tasks.py --priority high --format markdown

# Filter by labels
./scripts/list-tasks.py --labels "bug,urgent" --format markdown

# Combine filters
./scripts/list-tasks.py --project-id "2203306141" --status open --priority high --format markdown
```

Returns JSON:

```json
[
  {
    "id": "12345678",
    "system": "todoist",
    "type": "task",
    "title": "Review auth PR",
    "status": "open",
    "labels": ["priority:high", "review"],
    "url": "https://todoist.com/app/task/12345678",
    "systemData": {
      "project_id": "2203306141",
      "priority": 4,
      "due": "2025-10-29"
    }
  }
]
```

## Search Patterns

Natural language queries the skill should understand:

- "show my tasks" → all tasks
- "high priority tasks" → filter by priority:high
- "open tasks" / "active tasks" → filter by status:open
- "completed tasks" / "done tasks" → filter by status:closed
- "tasks in [project]" → filter by project
- "tasks with label X" → filter by labels
- "urgent tasks due soon" → priority:high + may need to parse due dates

## Cache Management

- Cache location: `~/.local/todu/todoist/tasks/`
- If cache is empty: Inform user and trigger sync
- If cache is stale (>1 hour): Offer to sync before searching
- Display cache timestamp with results if relevant

## Notes

- All searches use local cache (fast, offline-capable)
- Results are sorted by creation date (newest first)
- Due dates shown when present
- Project IDs are internal Todoist IDs (long numbers)
- Labels are case-sensitive
- Can combine multiple filters for precise searches
