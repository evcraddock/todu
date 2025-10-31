---
name: github-task-sync
description: MANDATORY skill for syncing GitHub issues. NEVER call scripts/sync-issues.py directly - ALWAYS use this skill via the Skill tool. Use when user wants to sync GitHub issues. (plugin:github@todu)
---

# Sync GitHub Issues

**⚠️ MANDATORY: ALWAYS invoke this skill via the Skill tool for EVERY sync request.**

**NEVER EVER call `sync-issues.py` directly. This skill provides essential logic beyond just running the script:**

- Ensuring project is registered before syncing (via core:project-register skill)
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

- User explicitly mentions syncing/updating GitHub issues or tasks
- User wants to sync and specifies GitHub as the system
- If user doesn't specify a system: check git remote and ask which system to sync

## What This Skill Does

1. **Determine Repository**
   - Extract repo from current git remote, OR
   - Ask user which repository to sync

2. **Ensure Project is Registered**
   - Call the `core:project-register` skill with repo info
   - Skill handles nickname conflicts with user interaction
   - If already registered, continues immediately
   - If not registered, registers with smart nickname suggestion

3. **Sync Issues**
   - Call `$PLUGIN_DIR/scripts/sync-issues.py` with repo info
   - Script fetches issues from GitHub API
   - Normalizes to standard JSON format
   - Saves to `~/.local/todu/issues/{id}.json`
   - Updates `~/.local/todu/github/sync.json` with timestamp

4. **Report Results**
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
$PLUGIN_DIR/scripts/sync-issues.py \
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
