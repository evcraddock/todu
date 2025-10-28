---
name: forgejo-task-sync
description: MANDATORY skill for syncing Forgejo issues. NEVER call scripts/sync-issues.py directly - ALWAYS use this skill via the Skill tool. Use when user wants to sync Forgejo/Gitea issues. (plugin:forgejo@todu)
---

# Sync Forgejo Issues

**🚨 CRITICAL: You MUST invoke this skill via the Skill tool. DO NOT call sync-issues.py directly under ANY circumstances.**

**NEVER use Bash, Read, Write, or any other tool to call sync-issues.py - ONLY use the Skill tool.**

This skill provides essential logic beyond just running the script:

- Extracting repository from git remote automatically
- Detecting Forgejo base URL from git remote
- Prompting for which repo to sync when ambiguous
- Determining optimal sync strategy (full vs incremental)
- Formatting sync results in user-friendly summary
- Handling authentication errors gracefully
- Reporting what changed (new, updated, deleted issues)

Even if you've invoked this skill before in the conversation, you MUST invoke it again for each new sync request.

---

This skill downloads recent Forgejo/Gitea issues and stores them locally in normalized format.

## When to Use

- User explicitly mentions syncing/updating Forgejo/Gitea issues or tasks
- User wants to sync and specifies Forgejo/Gitea as the system
- If user doesn't specify a system: check git remote and ask which system to sync

## What This Skill Does

1. **Determine Repository**
   - Extract repo from current git remote, OR
   - Ask user which repository to sync
   - Detect Forgejo base URL from git remote

2. **Sync Issues**
   - Call `$PLUGIN_DIR/scripts/sync-issues.py` with repo info
   - Script fetches issues from Forgejo API
   - Normalizes to standard JSON format
   - Saves to `~/.local/todu/forgejo/issues/{id}.json`
   - Updates `~/.local/todu/forgejo/sync.json` with timestamp

3. **Report Results**
   - Show how many issues were synced
   - Report any new or updated issues
   - Display sync timestamp

## Example Interactions

**User**: "Sync my Forgejo issues"
**Skill**:

- Detects repo from git remote: `owner/repo`
- Detects Forgejo URL: `https://forgejo.caradoc.com`
- Calls sync script
- Shows: "✅ Synced 45 issues (3 new, 2 updated) at 2025-10-27 14:30"

**User**: "Update tasks"
**Skill**:

- Asks: "Which system? (GitHub, Forgejo, Todoist)"
- User: "Forgejo"
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
