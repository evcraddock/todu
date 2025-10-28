---
name: forgejo-task-create
description: MANDATORY skill for creating Forgejo issues. NEVER call scripts/create-issue.py directly - ALWAYS use this skill via the Skill tool. Use when user wants to create a Forgejo/Gitea issue. (plugin:forgejo@todu)
---

# Create Forgejo Issue

**🚨 CRITICAL: You MUST invoke this skill via the Skill tool. DO NOT call create-issue.py directly under ANY circumstances.**

**NEVER use Bash, Read, Write, or any other tool to call create-issue.py - ONLY use the Skill tool.**

This skill provides essential logic beyond just running the script:

- Extracting git context (current branch, recent commits, modified files)
- Detecting Forgejo base URL from git remote
- Prompting for missing information (title, description, labels)
- Formatting issue body with rich git context
- Handling interactive clarifications
- Auto-syncing created issue to local cache

Even if you've invoked this skill before in the conversation, you MUST invoke it again for each new issue creation request.

---

This skill creates a Forgejo/Gitea issue with rich context from the current git environment.

## When to Use

- User explicitly mentions "Forgejo issue", "Gitea issue", or the system name
- User wants to create an issue and specifies Forgejo/Gitea as the system
- If user doesn't specify a system: check git remote and ask which system to use

## What This Skill Does

1. **Extract Git Context**
   - Current repository (from git remote)
   - Current branch name
   - Recent commits on this branch
   - Modified/staged files
   - Forgejo base URL from remote

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
- Detects Forgejo URL from git remote
- Prompts: "What should the issue title be?"
- User: "Users getting timeout on password reset"
- Prompts: "Any additional description?"
- Creates issue with git context in body
- Shows: "✅ Created issue #123: <https://forgejo.caradoc.com/owner/repo/issues/123>"

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
  "system": "forgejo",
  "title": "...",
  "url": "https://forgejo.caradoc.com/owner/repo/issues/123",
  "status": "open"
}
```
