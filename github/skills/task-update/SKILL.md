---
name: github-task-update
description: Update GitHub issue status, priority, or state. Use when user wants to mark issue as in-progress, change priority, close, or cancel an issue. Git remote must contain 'github.com'.
---

# Update GitHub Issue

**⚠️ IMPORTANT: Always invoke this skill via the Skill tool for EVERY update request.**

Do NOT call `update-issue.py` directly. This skill provides essential logic beyond just running the script:

- Identifying which issue to update (searching if user doesn't provide number)
- Prompting for missing information (what to update, with what value)
- Validating values against allowed options
- Handling natural language shortcuts ("mark as done" → close with status:done)
- Searching for issues by description when needed
- Providing clear confirmation messages

Even if you've invoked this skill before in the conversation, you MUST invoke it again for each new update request.

---

This skill updates a GitHub issue's status, priority, or closes/cancels it.

## When to Use

- User wants to change issue status (backlog → in-progress → done)
- User wants to set or change priority (low, medium, high)
- User wants to close or complete an issue
- User wants to cancel an issue
- Git remote URL contains `github.com`

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
cd $PLUGIN_DIR
./scripts/update-issue.py \
  --repo "owner/repo" \
  --issue 3 \
  --status in-progress \
  --priority high

# Close issue
./scripts/update-issue.py --repo "owner/repo" --issue 3 --close

# Cancel issue
./scripts/update-issue.py --repo "owner/repo" --issue 3 --cancel
```

Returns JSON:

```json
{
  "id": "3",
  "system": "github",
  "title": "...",
  "status": "closed",
  "labels": ["status:done", "priority:high"],
  "url": "https://github.com/owner/repo/issues/3"
}
```

## Notes

- Status and priority are managed via GitHub labels (`status:*`, `priority:*`)
- Only one status label and one priority label at a time
- `--close` sets `status:done` and closes the issue
- `--cancel` sets `status:canceled` and closes the issue
- Updated issue is automatically synced to local cache
- Labels are visible in GitHub UI and searchable
