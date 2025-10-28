---
name: github-task-search
description: Search GitHub issues in local cache without API calls. Use when user asks to find, list, show, or search for GitHub issues. Works with git remotes containing 'github.com' or when user mentions GitHub.
---

# Search GitHub Issues

**⚠️ IMPORTANT: Always invoke this skill via the Skill tool for EVERY search request.**

Do NOT call `list-issues.py` directly. This skill provides essential logic beyond just running the script:

- Parsing natural language search criteria from user query
- Prompting for clarification when filters are ambiguous
- Extracting repo context from git remote
- Formatting results in user-friendly display
- Detecting stale cache and suggesting sync
- Handling empty results gracefully

Even if you've invoked this skill before in the conversation, you MUST invoke it again for each new search request.

---

This skill searches locally cached GitHub issues with filtering capabilities.

## When to Use

- User asks to "show", "list", "find", or "search" issues
- User wants to filter by status, assignee, labels, or date
- Git remote contains `github.com` OR user mentions GitHub
- Fast queries without hitting API (reads from local cache)

## What This Skill Does

1. **Parse Search Criteria**
   - Extract filters from user query
   - Prompt for clarification if needed
   - Common filters: status, assignee, labels, date range

2. **Search Local Cache**
   - Call `$PLUGIN_DIR/scripts/list-issues.py` with filters
   - Script reads from `~/.local/todu/github/issues/`
   - Returns matching issues in requested format

3. **Display Results**
   - Show issues in readable format
   - Include key details: number, title, status, labels
   - Provide URLs for easy access

## Example Interactions

**User**: "Show me my open issues"
**Skill**:

- Calls list script with `--status open`
- Displays:

  ```
  Found 12 open issues:

  #156: Fix authentication timeout (bug, priority-high)
  #145: Add dark mode support (enhancement)
  #132: Update README (documentation)
  ...
  ```

**User**: "Find bugs assigned to me"
**Skill**:

- Extracts: status=open, labels=bug, assignee=current-user
- Shows filtered results

**User**: "List high priority issues"
**Skill**:

- Searches for label="priority-high"
- Returns matches

## Script Interface

```bash
cd $PLUGIN_DIR
./scripts/list-issues.py \
  --repo "owner/repo" \
  --status "open" \
  --assignee "username" \
  --labels "bug,priority-high" \
  --format "markdown"  # or "json"
```

Returns JSON array:

```json
[
  {
    "id": "156",
    "title": "Fix authentication timeout",
    "status": "open",
    "labels": ["bug", "priority-high"],
    "url": "https://github.com/owner/repo/issues/156"
  }
]
```

## Notes

- If cache is empty or stale, suggest running sync first
- Cache location: `~/.local/todu/github/issues/`
- No API calls = fast and works offline
