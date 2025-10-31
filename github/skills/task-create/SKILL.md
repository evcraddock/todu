---
name: github-task-create
description: MANDATORY skill for creating GitHub issues. NEVER call scripts/create-issue.py directly - ALWAYS use this skill via the Skill tool. Use when user wants to create a GitHub issue. (plugin:github@todu)
---

# Create GitHub Issue

**⚠️ MANDATORY: ALWAYS invoke this skill via the Skill tool for EVERY create request.**

**NEVER EVER call `create-issue.py` directly. This skill provides essential logic beyond just running the script:**

- Extracting git context (current branch, recent commits, modified files)
- Prompting for missing information (title, description, labels)
- Formatting issue body with rich git context
- Handling interactive clarifications
- Auto-syncing created issue to local cache

Even if you've invoked this skill before in the conversation, you MUST invoke it again for each new issue creation request.

---

This skill creates a GitHub issue with rich context from the current git environment.

## When to Use

- User explicitly mentions "GitHub issue", "GitHub", or "gh issue"
- User wants to create an issue and specifies GitHub as the system
- If user doesn't specify a system: check git remote and ask which system to use

## What This Skill Does

1. **Ensure Project is Registered**
   - Extract repo from current git remote or user input
   - Invoke the `core:project-register` skill via the Skill tool
   - The skill will:
     - Check if project is already registered (returns immediately if so)
     - If not registered, generate nickname suggestion and handle conflicts
     - Register the project with user-chosen nickname
   - Use the registered project info for issue creation

2. **Extract Git Context**
   - Current repository (from git remote)
   - Current branch name
   - Recent commits on this branch
   - Modified/staged files

3. **Gather Issue Details**
   - Prompt for title if not provided
   - Prompt for description/body (can include git context)
   - Ask about labels (e.g., bug, enhancement, documentation)
   - Ask about assignees (optional)

4. **Create the Issue**
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
$PLUGIN_DIR/scripts/create-issue.py \
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
