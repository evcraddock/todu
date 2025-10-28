---
name: github-task-sync
description: Sync GitHub issues to local cache for faster access and offline reporting. Use when the git remote contains 'github.com' OR user mentions syncing/updating GitHub tasks.
---

# Sync GitHub Issues

**⚠️ IMPORTANT: Always invoke this skill via the Skill tool for EVERY sync request.**

Do NOT call `sync-issues.py` directly. This skill provides essential logic beyond just running the script:

- Extracting repository from git remote automatically
- Prompting for which repo to sync when ambiguous
- Determining optimal sync strategy (full vs incremental)
- Formatting sync results in user-friendly summary
- Handling authentication errors gracefully
- Reporting what changed (new, updated, deleted issues)

Even if you've invoked this skill before in the conversation, you MUST invoke it again for each new sync request.

---

This skill downloads recent GitHub issues and stores them locally in normalized format.

## When to Use

- User wants to update local task cache
- User mentions "sync", "refresh", or "update" GitHub issues
- Before running searches when cache might be stale
- Git remote contains `github.com`

## What This Skill Does

1. **Determine Repository**
   - Extract repo from current git remote, OR
   - Ask user which repository to sync

2. **Sync Issues**
   - Call `$PLUGIN_DIR/scripts/sync-issues.py` with repo info
   - Script fetches issues from GitHub API
   - Normalizes to standard JSON format
   - Saves to `~/.local/todu/github/issues/{id}.json`
   - Updates `~/.local/todu/github/sync.json` with timestamp

3. **Report Results**
   - Show how many issues were synced
   - Report any new or updated issues
   - Display sync timestamp

## Example Interactions

**User**: "Sync my GitHub issues"
**Skill**:

- Detects repo from git remote: `owner/repo`
- Calls sync script
- Shows: "✅ Synced 45 issues (3 new, 2 updated) at 2025-10-27 14:30"

**User**: "Update tasks"
**Skill**:

- Asks: "Which system? (GitHub, Forgejo, Todoist)"
- User: "GitHub"
- Syncs and reports results

## Script Interface

```bash
cd $PLUGIN_DIR
./scripts/sync-issues.py \
  --repo "owner/repo" \
  --since "2025-10-27T10:00:00Z"  # optional, for incremental sync
```

Returns JSON:

```json
{
  "synced": 45,
  "new": 3,
  "updated": 2,
  "timestamp": "2025-10-27T14:30:00Z"
}
```
