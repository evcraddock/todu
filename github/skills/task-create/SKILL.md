---
name: github-task-create
description: Create a GitHub issue with context from the current git repository, branch, and recent commits. Use when the git remote contains 'github.com' OR user explicitly mentions GitHub. If unsure which task system to use, ask the user.
---

# Create GitHub Issue

**⚠️ IMPORTANT: Always invoke this skill via the Skill tool for EVERY create request.**

Do NOT call `create-issue.py` directly. This skill provides essential logic beyond just running the script:

- Extracting git context (current branch, recent commits, modified files)
- Prompting for missing information (title, description, labels)
- Formatting issue body with rich git context
- Handling interactive clarifications
- Auto-syncing created issue to local cache

Even if you've invoked this skill before in the conversation, you MUST invoke it again for each new issue creation request.

---

This skill creates a GitHub issue with rich context from the current git environment.

## When to Use

- Git remote URL contains `github.com`
- User explicitly mentions "GitHub issue" or "gh issue"
- User wants to create an issue for a bug, feature, or task

## What This Skill Does

1. **Extract Git Context**
   - Current repository (from git remote)
   - Current branch name
   - Recent commits on this branch
   - Modified/staged files

2. **Gather Issue Details**
   - Prompt for title if not provided
   - Prompt for description/body (can include git context)
   - Ask about labels (e.g., bug, enhancement, documentation)
   - Ask about assignees (optional)

3. **Create the Issue**
   - Call `$PLUGIN_DIR/scripts/create-issue.py` with collected information
   - Script returns normalized JSON with issue details
   - Display confirmation with issue URL

## Example Interactions

**User**: "Create an issue for this authentication bug"
**Skill**:

- Extracts current branch: `fix/auth-timeout`
- Finds recent commits related to auth
- Prompts: "What should the issue title be?"
- User: "Users getting timeout on password reset"
- Prompts: "Any additional description?"
- Creates issue with git context in body
- Shows: "✅ Created issue #123: <https://github.com/owner/repo/issues/123>"

## Script Interface

```bash
cd $PLUGIN_DIR
./scripts/create-issue.py \
  --repo "owner/repo" \
  --title "Issue title" \
  --body "Issue description with git context" \
  --labels "bug,priority-high"
```

Returns JSON:

```json
{
  "id": "123",
  "system": "github",
  "title": "...",
  "url": "https://github.com/owner/repo/issues/123",
  "status": "open"
}
```
