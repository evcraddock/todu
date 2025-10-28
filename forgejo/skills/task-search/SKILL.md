---
name: forgejo-task-search
description: MANDATORY skill for searching Forgejo issues. NEVER call scripts/list-issues.py directly - ALWAYS use this skill via the Skill tool. Use when user wants to search Forgejo/Gitea issues. (plugin:forgejo@todu)
---

# Search Forgejo Issues

**🚨 CRITICAL: You MUST invoke this skill via the Skill tool. DO NOT call list-issues.py directly under ANY circumstances.**

**NEVER use Bash, Read, Write, or any other tool to call list-issues.py - ONLY use the Skill tool.**

This skill provides essential logic beyond just running the script:

- Parsing natural language search criteria from user query
- Prompting for clarification when filters are ambiguous
- Extracting repo context from git remote
- Formatting results in user-friendly display
- Detecting stale cache and suggesting sync
- Handling empty results gracefully

Even if you've invoked this skill before in the conversation, you MUST invoke it again for each new search request.

---

This skill searches locally cached Forgejo/Gitea issues with filtering capabilities.

## When to Use

- User explicitly mentions searching/listing/finding Forgejo/Gitea issues
- User wants to search and specifies Forgejo/Gitea as the system
- If user doesn't specify a system: check git remote and ask which system to search
- Fast queries without hitting API (reads from local cache)

## What This Skill Does

1. **Parse Search Criteria**
   - Extract filters from user query
   - Prompt for clarification if needed
   - Common filters: status, assignee, labels, date range

2. **Search Local Cache**
   - Call `$PLUGIN_DIR/scripts/list-issues.py` with filters
   - Script reads from `~/.local/todu/forgejo/issues/`
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
    "url": "https://forgejo.example.com/owner/repo/issues/156"
  }
]
```

## Notes

- If cache is empty or stale, suggest running sync first
- Cache location: `~/.local/todu/forgejo/issues/`
- No API calls = fast and works offline
