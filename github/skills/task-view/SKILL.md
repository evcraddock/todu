---
name: github-task-view
description: MANDATORY skill for viewing GitHub issue details with comments. NEVER call scripts/view-issue.py directly - ALWAYS use this skill via the Skill tool. Use when user wants to view, show, or display a GitHub issue with full details and comments. (plugin:github@todu)
---

# View GitHub Issue Details

**⚠️ MANDATORY: ALWAYS invoke this skill via the Skill tool for EVERY view request.**

**NEVER EVER call `view-issue.py` directly. This skill provides essential logic beyond just running the script:**

- Parsing issue identifiers from natural language queries
- Searching local cache to find repo context if not specified
- Prompting for clarification when issue is ambiguous
- Extracting repo context from git remote
- Formatting output with metadata and all comments
- Handling errors gracefully

Even if you've invoked this skill before in the conversation, you MUST invoke it again for each new view request.

---

This skill displays full details of a GitHub issue including all comments.

## When to Use

- User explicitly mentions viewing/showing/displaying a GitHub issue
- User says something like "view issue 123" or "show me issue 456"
- User wants to see full details including comments
- Fetches fresh data from GitHub API (not from cache)

## What This Skill Does

1. **Parse Request**
   - Extract issue number from user query
   - Determine repo context (explicit, from git remote, or search cache)
   - Prompt for clarification if needed

2. **Fetch Fresh Data**
   - Call `$PLUGIN_DIR/scripts/view-issue.py` with repo and issue number
   - Script fetches issue + all comments from GitHub API
   - Comments are NOT cached (always fresh)

3. **Display Results**
   - Show issue in markdown format with:
     - Title, status, labels, assignees
     - Full description
     - All comments with authors and timestamps
     - URL for easy access

## Example Interactions

**User**: "View issue 123"
**Skill**:

- Searches local cache for issue #123 to find repo
- If found: calls view script with repo info
- If not found or ambiguous: asks user for repo
- Displays full issue with comments

**User**: "Show me github issue 156 from owner/repo"
**Skill**:

- Extracts: repo=owner/repo, issue=156
- Calls view script directly
- Shows full markdown output

**User**: "View issue owner/repo#123"
**Skill**:

- Parses repo and issue from format
- Fetches and displays

## Script Interface

```bash
$PLUGIN_DIR/scripts/view-issue.py \
  --repo "owner/repo" \
  --issue 123
```

Returns markdown output:

```markdown
# Issue #123: Fix authentication bug

**System:** GitHub
**Repository:** owner/repo
**Status:** open
**Labels:** bug, priority:high
**Assignees:** alice, bob
**Created:** 2025-10-27 10:00:00
**Updated:** 2025-10-28 15:30:00
**URL:** https://github.com/owner/repo/issues/123

## Description

Users can't log in after the recent update...

## Comments

### alice commented on 2025-10-27 11:00:00

I can reproduce this on my machine...

### bob commented on 2025-10-27 14:00:00

Here's a potential fix...
```

## Notes

- Always fetches fresh data from GitHub API
- Comments are never cached
- Requires GITHUB_TOKEN environment variable
- Can search local cache to find repo context if not specified
