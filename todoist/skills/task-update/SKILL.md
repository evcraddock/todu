---
name: todoist-task-update
description: MANDATORY skill for updating Todoist tasks. NEVER call scripts/update-task.py directly - ALWAYS use this skill via the Skill tool. NO EXCEPTIONS WHATSOEVER. Use when user wants to update a Todoist task. (plugin:todoist@todu)
---

# Update Todoist Task

**⚠️ ABSOLUTELY MANDATORY: ALWAYS invoke this skill via the Skill tool for EVERY update request. NO EXCEPTIONS.**

**NEVER CALL `update-task.py` directly under ANY circumstances. If you call the script directly instead of using this skill, you are doing it WRONG. This skill provides essential logic beyond just running the script:**

- Identifying the task to update (by ID, title search, or context)
- Parsing update intent from natural language
- Validating status and priority values
- Handling shortcuts like "mark as done", "complete task"
- Auto-syncing after update

Even if you've invoked this skill before in the conversation, you MUST invoke it again for each new update request.

---

This skill updates a Todoist task's status, priority, or completion state.

## When to Use

- User wants to update, modify, or change a Todoist task
- User says "mark task as done", "complete task", "close task"
- User wants to change priority: "make it high priority"
- User wants to update status: "set to in-progress"
- User mentions task by ID or description

## What This Skill Does

1. **Identify Task**
   - If user provides task ID: use it directly
   - If user provides description: search cache for matching task
   - If ambiguous: show matching tasks and ask user to clarify
   - If task mentioned in context: infer which task

2. **Determine Updates**
   - Parse what user wants to change
   - Status: backlog, in-progress, done, canceled
   - Priority: low, medium, high
   - Completion: complete (mark as done), close, cancel
   - Validate values are in allowed set

3. **Execute Update**
   - Call `$PLUGIN_DIR/scripts/update-task.py` with task ID and updates
   - Script updates task via Todoist API
   - Returns normalized JSON with updated task

4. **Confirm Result**
   - Display confirmation message
   - Show updated task details
   - Provide task URL for reference
   - DO NOT mention cache updates - this is transparent to the user

## Example Interactions

**User**: "Mark task 12345678 as done"
**Skill**:

- Identifies: task ID = 12345678
- Parses: complete = true, status = done
- Calls: `update-task.py --task-id 12345678 --complete`
- Shows: "✅ Marked task 12345678 as completed"

**User**: "Set my auth fix task to high priority"
**Skill**:

- Searches cache for tasks matching "auth fix"
- Finds: task 87654321 "Complete auth timeout fix"
- Confirms: "Update 'Complete auth timeout fix'? (y/n)"
- User: "y"
- Calls: `update-task.py --task-id 87654321 --priority high`
- Shows: "✅ Updated task priority to high"

**User**: "Cancel the code review task"
**Skill**:

- Searches for "code review" in cached tasks
- Finds multiple matches
- Lists: "Found 2 tasks: [1] Code review for PR #42, [2] Review code standards"
- Prompts: "Which task? (1-2)"
- User: "1"
- Calls: `update-task.py --task-id {id} --cancel`
- Shows: "✅ Canceled task and marked as completed"

**User**: "Move task 12345678 to in-progress"
**Skill**:

- Identifies: task ID = 12345678, status = in-progress
- Calls: `update-task.py --task-id 12345678 --status in-progress`
- Shows: "✅ Updated task status to in-progress"

## Script Interface

```bash
# Mark as completed
$PLUGIN_DIR/scripts/update-task.py --task-id "12345678" --complete

# Change status
$PLUGIN_DIR/scripts/update-task.py --task-id "12345678" --status "in-progress"

# Change priority
$PLUGIN_DIR/scripts/update-task.py --task-id "12345678" --priority "high"

# Close (marks as done)
$PLUGIN_DIR/scripts/update-task.py --task-id "12345678" --close

# Cancel (marks as canceled and closes)
$PLUGIN_DIR/scripts/update-task.py --task-id "12345678" --cancel

# Combine updates
$PLUGIN_DIR/scripts/update-task.py --task-id "12345678" --status "done" --priority "high" --complete
```

Returns JSON:

```json
{
  "id": "12345678",
  "system": "todoist",
  "type": "task",
  "title": "Review auth PR",
  "status": "closed",
  "labels": ["priority:high", "status:done"],
  "url": "https://todoist.com/app/task/12345678",
  "systemData": {
    "project_id": "2203306141",
    "priority": 4,
    "is_completed": true
  }
}
```

## Valid Values

**Status** (maps to labels, affects completion):

- `backlog` - Task is backlogged
- `in-progress` - Task is being worked on
- `done` - Task is completed (completes the task)
- `canceled` - Task is canceled (completes the task)

**Priority** (maps to Todoist priority numbers):

- `low` - Todoist priority 2 (medium)
- `medium` - Todoist priority 3 (high)
- `high` - Todoist priority 4 (urgent)

**Completion Flags**:

- `--complete` - Mark task as done
- `--close` - Close task (defaults to done)
- `--cancel` - Cancel task (sets status:canceled and closes)

## Natural Language Shortcuts

The skill should recognize these common phrases:

- "mark as done", "mark complete", "complete task" → `--complete`
- "close task", "finish task" → `--close`
- "cancel task", "cancel this" → `--cancel`
- "make it high priority" → `--priority high`
- "set to in-progress", "start working on" → `--status in-progress`
- "move to backlog" → `--status backlog`
- "reopen task" → remove completion (may need different handling)

## Task Identification Strategies

1. **Explicit ID**: User provides task ID directly
2. **Title search**: Search cache for tasks with matching titles
3. **Recent context**: If user just created or viewed a task, use that
4. **Disambiguation**: If multiple matches, show list and let user choose

## Notes

- Task ID is required for all updates
- At least one update (status, priority, or completion flag) must be specified
- `--close` and `--cancel` are mutually exclusive
- Status changes may automatically affect completion (done/canceled complete the task)
- Task URLs are returned for easy access
- DO NOT mention cache synchronization to the user - it happens transparently
