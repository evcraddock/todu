---
name: todoist-task-view
description: MANDATORY skill for viewing Todoist task details with comments. NEVER call scripts/view-task.py directly - ALWAYS use this skill via the Skill tool. Use when user wants to view, show, or display a Todoist task with full details and comments. (plugin:todoist@todu)
---

# View Todoist Task Details

**⚠️ MANDATORY: ALWAYS invoke this skill via the Skill tool for EVERY view request.**

**NEVER EVER call `view-task.py` directly. This skill provides essential logic beyond just running the script:**

- Parsing task identifiers from natural language queries
- Searching local cache to find task ID if not specified
- Prompting for clarification when task is ambiguous
- Formatting output with metadata and all comments
- Handling errors gracefully

Even if you've invoked this skill before in the conversation, you MUST invoke it again for each new view request.

---

This skill displays full details of a Todoist task including all comments.

## When to Use

- User explicitly mentions viewing/showing/displaying a Todoist task
- User says something like "view task abc123" or "show me task xyz"
- User wants to see full details including comments
- Fetches fresh data from Todoist API (not from cache)

## What This Skill Does

1. **Parse Request**
   - Extract task ID from user query
   - If only a numeric ID provided, search cache to find task
   - Prompt for clarification if needed

2. **Fetch Fresh Data**
   - Call `$PLUGIN_DIR/scripts/view-task.py` with task ID
   - Script fetches task + all comments from Todoist API
   - Comments are NOT cached (always fresh)

3. **Display Results**
   - Show task in markdown format with:
     - Title, status, labels, priority
     - Full description
     - All comments with timestamps
     - URL for easy access

## Example Interactions

**User**: "View task abc123"
**Skill**:

- Extracts task ID: abc123
- Calls view script
- Displays full task with comments

**User**: "Show me task 456" (numeric ID)
**Skill**:

- Searches local cache for task with ID 456
- If found: uses that task ID
- If not found: asks user for full task ID
- Displays task details

**User**: "View my task"
**Skill**:

- Asks user for task ID or more specifics
- Once clarified, fetches and displays

## Script Interface

```bash
$PLUGIN_DIR/scripts/view-task.py \
  --task-id "abc123xyz"
```

Returns markdown output:

```markdown
# Task: Fix authentication bug

**System:** Todoist
**Project:** Work
**Status:** open
**Labels:** bug, priority:high
**Priority:** High
**Due:** 2025-11-01
**Created:** 2025-10-27 10:00:00
**URL:** https://todoist.com/app/task/abc123xyz

## Description

Users can't log in after the recent update...

## Comments

### Comment on 2025-10-27 11:00:00

I can reproduce this on my machine...

### Comment on 2025-10-27 14:00:00

Here's a potential fix...
```

## Notes

- Always fetches fresh data from Todoist API
- Comments are never cached
- Requires TODOIST_TOKEN environment variable
- Can search local cache to help identify task ID
- Todoist task IDs are UUID strings, not simple numbers
