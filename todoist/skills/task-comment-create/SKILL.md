---
name: todoist-task-comment-create
description: MANDATORY skill for creating Todoist task comments. NEVER call scripts/create-comment.py directly - ALWAYS use this skill via the Skill tool. Use when user wants to add a comment to a Todoist task. (plugin:todoist@todu)
---

# Create Todoist Task Comment

**⚠️ MANDATORY: ALWAYS invoke this skill via the Skill tool for EVERY comment creation request.**

**NEVER EVER call `create-comment.py` directly. This skill provides essential logic beyond just running the script:**

- Prompting for missing information (task ID, comment body)
- Handling interactive clarifications
- Formatting output with task reference

Even if you've invoked this skill before in the conversation, you MUST invoke it again for each new comment creation request.

---

This skill creates a comment on a Todoist task.

## When to Use

- User wants to comment on a Todoist task
- User mentions "comment on task", "add comment to Todoist task"
- User provides task ID and wants to add a comment
- If user doesn't specify a system: ask which system to use (Todoist for personal tasks)

## What This Skill Does

1. **Extract Context**
   - Task ID from user input (UUID format)
   - Comment body from user input

2. **Gather Comment Details**
   - Prompt for task ID if not provided
   - Prompt for comment body if not provided

3. **Create the Comment**
   - Call `$PLUGIN_DIR/scripts/create-comment.py` with collected information
   - Script returns JSON with comment details
   - Display confirmation with task reference

## Example Interactions

**User**: "Add a comment to task abc123xyz saying 'Working on this today'"
**Skill**:

- Task ID: `abc123xyz`
- Comment body: `Working on this today`
- Creates comment
- Shows: "✅ Created comment on task abc123xyz"

**User**: "Comment on my task with ID xyz789 saying 'Blocked by issue #42'"
**Skill**:

- Task ID: `xyz789`
- Comment body: `Blocked by issue #42`
- Creates comment
- Shows: "✅ Created comment on task xyz789"

## Script Interface

```bash
$PLUGIN_DIR/scripts/create-comment.py \
  --task-id "abc123xyz789" \
  --body "Comment text here"
```

Returns JSON:

```json
{
  "id": "987654321",
  "task_id": "abc123xyz789",
  "content": "Comment text here",
  "posted_at": "2025-10-28T10:30:00Z",
  "system": "todoist"
}
```

## Note

Todoist comments are personal notes on tasks and do not include author information (since all tasks are personal to the authenticated user).
