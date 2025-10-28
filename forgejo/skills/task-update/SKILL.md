---
name: forgejo-task-update
description: MANDATORY skill for updating Forgejo issues. NEVER call scripts/update-issue.py directly - ALWAYS use this skill via the Skill tool. Use when user wants to update a Forgejo/Gitea issue. (plugin:forgejo@todu)
---

# Update Forgejo Issue

**🚨 CRITICAL: You MUST invoke this skill via the Skill tool. DO NOT call update-issue.py directly under ANY circumstances.**

**NEVER use Bash, Read, Write, or any other tool to call update-issue.py - ONLY use the Skill tool.**

This skill provides essential logic beyond just running the script:

- Identifying which issue to update (searching if user doesn't provide number)
- Prompting for missing information (what to update, with what value)
- Validating values against allowed options
- Handling natural language shortcuts ("mark as done" → close with status:done)
- Searching for issues by description when needed
- Providing clear confirmation messages

Even if you've invoked this skill before in the conversation, you MUST invoke it again for each new update request.

---

This skill updates a Forgejo/Gitea issue's status, priority, or closes/cancels it.

## When to Use

- User explicitly mentions updating a Forgejo/Gitea issue
- User wants to update and specifies Forgejo/Gitea as the system
- If user doesn't specify a system: check git remote and ask which system to use

## What This Skill Does

1. **Identify Issue**
   - Extract issue number from user message, OR
   - Ask user which issue to update
   - Verify it's a valid issue (not a PR)

2. **Determine Updates**
   - Ask what to update (status? priority? close?)
   - Validate values against allowed options
   - Handle shortcuts like "mark as done" → close with status:done

3. **Update the Issue**
   - Call `$PLUGIN_DIR/scripts/update-issue.py` with appropriate flags
   - Script manages label updates (removes old status:/priority: labels, adds new)
   - Closes issue if requested
   - Auto-syncs updated issue to local cache

4. **Confirm Changes**
   - Show what was updated
   - Display new status/priority/state
   - Show issue URL for reference

## Valid Values

**Status:** (mutually exclusive)

- `backlog` - Not started, in the queue
- `in-progress` - Actively being worked on
- `done` - Completed successfully
- `canceled` - Won't be completed

**Priority:** (mutually exclusive)

- `low` - Can wait, not urgent
- `medium` - Normal priority
- `high` - Important, address soon

## Example Interactions

**User**: "Mark issue #3 as in progress"
**Skill**:

- Calls: `update-issue.py --repo "owner/repo" --issue 3 --status in-progress`
- Shows: "✅ Updated #3: Status set to in-progress"

**User**: "Set priority high on issue #2"
**Skill**:

- Calls: `update-issue.py --repo "owner/repo" --issue 2 --priority high`
- Shows: "✅ Updated #2: Priority set to high"

**User**: "I'm done with issue #1"
**Skill**:

- Calls: `update-issue.py --repo "owner/repo" --issue 1 --close`
- Shows: "✅ Closed #1: Status set to done, issue closed"

**User**: "Cancel issue #4"
**Skill**:

- Calls: `update-issue.py --repo "owner/repo" --issue 4 --cancel`
- Shows: "✅ Canceled #4: Status set to canceled, issue closed"

**User**: "Start working on the authentication bug"
**Skill**:

- Searches cached issues for "authentication bug"
- Finds issue #5
- Asks: "Found issue #5: Fix authentication timeout. Mark as in-progress?"
- User: "Yes"
- Updates and confirms

## Script Interface

```bash
$PLUGIN_DIR/scripts/update-issue.py \
  --repo "owner/repo" \
  --issue 3 \
  --status in-progress \
  --priority high

# Close issue
$PLUGIN_DIR/scripts/update-issue.py --repo "owner/repo" --issue 3 --close

# Cancel issue
$PLUGIN_DIR/scripts/update-issue.py --repo "owner/repo" --issue 3 --cancel
```

Returns JSON:

```json
{
  "id": "3",
  "system": "forgejo",
  "title": "...",
  "status": "closed",
  "labels": ["status:done", "priority:high"],
  "url": "https://forgejo.example.com/owner/repo/issues/3"
}
```

## Notes

- Status and priority are managed via Forgejo labels (`status:*`, `priority:*`)
- Only one status label and one priority label at a time
- `--close` sets `status:done` and closes the issue
- `--cancel` sets `status:canceled` and closes the issue
- Updated issue is automatically synced to local cache
- Labels are visible in Forgejo UI and searchable
