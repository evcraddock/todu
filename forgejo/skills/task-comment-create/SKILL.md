---
name: forgejo-task-comment-create
description: MANDATORY skill for creating Forgejo issue comments. NEVER call scripts/create-comment.py directly - ALWAYS use this skill via the Skill tool. Use when user wants to add a comment to a Forgejo issue. (plugin:forgejo@todu)
---

# Create Forgejo Issue Comment

**⚠️ MANDATORY: ALWAYS invoke this skill via the Skill tool for EVERY comment creation request.**

**NEVER EVER call `create-comment.py` directly. This skill provides essential logic beyond just running the script:**

- Extracting git context (current repository from remote)
- Prompting for missing information (issue number, comment body)
- Handling interactive clarifications
- Formatting output with comment URL

Even if you've invoked this skill before in the conversation, you MUST invoke it again for each new comment creation request.

---

This skill creates a comment on a Forgejo issue.

## When to Use

- User wants to comment on a Forgejo issue
- User mentions "comment on issue", "add comment to Forgejo issue"
- User provides issue reference and the git remote is a Forgejo instance
- If user doesn't specify a system: check git remote and ask which system to use

## What This Skill Does

1. **Extract Context**
   - Current repository (from git remote if not specified)
   - Forgejo base URL (from FORGEJO_URL env or git remote)
   - Issue number from user input
   - Comment body from user input

2. **Gather Comment Details**
   - Prompt for repo if not provided (format: owner/repo)
   - Prompt for issue number if not provided
   - Prompt for comment body if not provided

3. **Create the Comment**
   - Call `$PLUGIN_DIR/scripts/create-comment.py` with collected information
   - Script returns JSON with comment details
   - Display confirmation with comment URL

## Example Interactions

**User**: "Add a comment to issue #42 saying 'Fixed in PR #43'"
**Skill**:

- Extracts current repo from git remote: `owner/repo`
- Extracts Forgejo URL from git remote
- Issue number: `42`
- Comment body: `Fixed in PR #43`
- Creates comment
- Shows: "✅ Created comment on issue #42: <https://forgejo.example.com/owner/repo/issues/42#issuecomment-123456>"

**User**: "Comment on owner/repo#123 with 'This is still an issue'"
**Skill**:

- Parses: repo=`owner/repo`, issue=`123`
- Comment body: `This is still an issue`
- Creates comment
- Shows: "✅ Created comment: <https://forgejo.example.com/owner/repo/issues/123#issuecomment-789012>"

## Script Interface

```bash
$PLUGIN_DIR/scripts/create-comment.py \
  --repo "owner/repo" \
  --issue 123 \
  --body "Comment text here"
```

Returns JSON:

```json
{
  "id": 123456789,
  "issue_number": 123,
  "author": "username",
  "body": "Comment text here",
  "created_at": "2025-10-28T10:30:00Z",
  "updated_at": "2025-10-28T10:30:00Z",
  "html_url": "https://forgejo.example.com/owner/repo/issues/123#issuecomment-123456789",
  "system": "forgejo",
  "repo": "owner/repo"
}
```
