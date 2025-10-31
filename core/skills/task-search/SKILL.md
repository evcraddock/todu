---
name: task-search
description: MANDATORY skill for searching tasks and issues across all systems (GitHub, Forgejo, Todoist). NEVER call scripts/list-items.py directly - ALWAYS use this skill via the Skill tool. Use when user wants to find, list, show, or search tasks/issues. (plugin:core@todu)
---

# Search Tasks and Issues

**⚠️ MANDATORY: ALWAYS invoke this skill via the Skill tool for EVERY search request.**

**NEVER EVER call `list-items.py` directly. This skill provides essential logic beyond just running the script:**

- Parsing natural language search criteria from user query
- Prompting for clarification when filters are ambiguous
- Detecting system from git remote context
- Formatting results in user-friendly display
- Detecting stale cache and suggesting sync
- Handling empty results gracefully
- Supporting cross-system searches

Even if you've invoked this skill before in the conversation, you MUST invoke it again for each new search request.

---

This skill searches locally cached tasks and issues across all systems (GitHub, Forgejo, Todoist) with filtering capabilities.

## When to Use

- User explicitly mentions searching/listing/finding tasks or issues
- User wants to search without specifying a system (searches all)
- User wants to search a specific system (GitHub, Forgejo, Todoist)
- Fast queries without hitting API (reads from local cache)

## What This Skill Does

1. **Determine System Context**
   - If user mentions "GitHub", "Forgejo", or "Todoist" - filter to that system
   - If in a git repo - detect remote and prefer that system's results
   - Otherwise - search ALL systems and display unified results

2. **Parse Search Criteria**
   - Extract filters from user query
   - Prompt for clarification if needed
   - Common filters: system, status, assignee, labels, project-id

3. **Search Local Cache**
   - Call `$PLUGIN_DIR/scripts/list-items.py` with filters
   - Script reads from `~/.local/todu/items/` (or legacy structure)
   - Returns matching items in requested format

4. **Display Results**
   - Show items in readable format with system prefix: `[GITHUB]`, `[FORGEJO]`, `[TODOIST]`
   - Include key details: number, title, status, labels
   - Provide URLs for easy access
   - Group by system if showing multiple systems

## Example Interactions

**User**: "Show me my open tasks"
**Skill**:

- Detects git remote (if available) to determine context
- Calls: `list-items.py --status open --format markdown`
- Displays:

  ```
  Found 31 open items:

  [GITHUB] #16: Fix Date format in daily report (priority:high)
  [FORGEJO] #11: Create skill for downloading daily report (priority:high)
  [TODOIST] Implement dark mode (enhancement, priority:medium)
  ...
  ```

**User**: "Find my open GitHub bugs"
**Skill**:

- Extracts: system=github, status=open, labels=bug
- Calls: `list-items.py --system github --status open --labels bug --format markdown`
- Shows filtered results from GitHub only

**User**: "Show high priority issues"
**Skill**:

- Searches for label="priority:high" across all systems
- Displays results grouped by system

**User**: "List my Todoist tasks in project X"
**Skill**:

- Prompts: "What's the project ID?" (or looks up if known)
- Calls: `list-items.py --system todoist --project-id 12345 --format markdown`
- Displays: Filtered task list from Todoist

## Script Interface

```bash
# Search all systems
$PLUGIN_DIR/scripts/list-items.py --format markdown

# Filter by specific system
$PLUGIN_DIR/scripts/list-items.py --system github --format markdown
$PLUGIN_DIR/scripts/list-items.py --system forgejo --format markdown
$PLUGIN_DIR/scripts/list-items.py --system todoist --format markdown

# Filter by status
$PLUGIN_DIR/scripts/list-items.py --status open --format markdown

# Filter by labels
$PLUGIN_DIR/scripts/list-items.py --labels "bug,priority:high" --format markdown

# Filter by assignee
$PLUGIN_DIR/scripts/list-items.py --assignee "username" --format markdown

# Filter by project (Todoist)
$PLUGIN_DIR/scripts/list-items.py --system todoist --project-id "2203306141" --format markdown

# Combine filters
$PLUGIN_DIR/scripts/list-items.py --system github --status open --labels bug --format markdown
```

Returns JSON array:

```json
[
  {
    "id": "156",
    "system": "github",
    "type": "issue",
    "title": "Fix authentication timeout",
    "status": "open",
    "labels": ["bug", "priority:high"],
    "url": "https://github.com/owner/repo/issues/156",
    "assignees": [],
    "systemData": {
      "repo": "owner/repo",
      "number": 156
    }
  },
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
      "due": "2025-10-29"
    }
  }
]
```

## Search Patterns

Natural language queries the skill should understand:

- "show my tasks" → all items across all systems
- "show my GitHub issues" → filter by system=github
- "show my Forgejo issues" → filter by system=forgejo
- "show my Todoist tasks" → filter by system=todoist
- "high priority tasks" → filter by labels containing "priority:high"
- "open tasks" / "active tasks" → filter by status=open
- "completed tasks" / "done tasks" → filter by status=closed
- "bugs" → filter by labels=bug
- "tasks assigned to me" → filter by assignee
- "urgent tasks due soon" → priority:high + may need to parse due dates

## System Detection

When user doesn't specify a system:

1. Check if in a git repository
2. Run `git remote -v` to detect platform
3. If remote contains "github.com" → suggest filtering to GitHub
4. If remote contains "forgejo" or "gitea" → suggest filtering to Forgejo
5. Otherwise → search all systems

## Cache Management

- Cache locations:
  - New: `~/.local/todu/items/`
  - Legacy: `~/.local/todu/{system}/issues/` or `~/.local/todu/{system}/tasks/`
- If cache is empty: Inform user and suggest running sync
- If cache is stale (>1 hour): Offer to sync before searching
- Script automatically handles both cache structures

## Display Format

When showing results from multiple systems, group by system:

```
Found 15 items:

## GitHub (8 items)
#42: Fix auth bug (bug, priority:high)
#38: Update docs (documentation)
...

## Forgejo (5 items)
#11: Create daily report skill (priority:high)
#8: Update README (documentation)
...

## Todoist (2 items)
Implement dark mode (enhancement, priority:medium)
Review PR #42 (priority:high, review)
...
```

When showing results from single system, omit grouping.

## Notes

- All searches use local cache (fast, offline-capable)
- Cross-system search is the default behavior
- Can combine multiple filters for precise searches
- Supports both new consolidated cache and legacy plugin-specific caches
- No API calls = fast and works offline
