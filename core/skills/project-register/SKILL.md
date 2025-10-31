---
name: core-project-register
description: MANDATORY skill for registering projects with nickname conflict resolution. NEVER call scripts/register-project.py directly - ALWAYS use this skill via the Skill tool. Use when you need to register a project (GitHub repo, Forgejo repo, or Todoist project). (plugin:core@todu)
---

# Register Project

**⚠️ MANDATORY: ALWAYS invoke this skill via the Skill tool for EVERY project registration.**

**NEVER EVER call `register-project.py` directly. This skill provides essential logic beyond just running the script:**

- Checking if project is already registered (avoiding duplicates)
- Generating smart nickname suggestions from repo/project names
- Handling nickname conflicts with user interaction via AskUserQuestion
- Providing clear feedback about registration status

Even if you've invoked this skill before in the conversation, you MUST invoke it again for each new registration request.

---

This skill registers a project (GitHub repo, Forgejo repo, or Todoist project) in the project registry with intelligent nickname handling and conflict resolution.

## When to Use

- Before syncing a repo/project for the first time
- User explicitly requests to register a project
- Any operation that needs to ensure a project is registered
- Called by sync skills before syncing

## What This Skill Does

1. **Check if Already Registered**
   - Call `$CLAUDE_PLUGIN_ROOT/core/scripts/resolve-project.py` with repo/project info
   - If already registered, return success immediately
   - If not registered, proceed to step 2

2. **Generate Nickname Suggestion**
   - For GitHub/Forgejo repos: Extract repo name from owner/repo format (e.g., "evcraddock/todu" → "todu")
   - For Todoist projects: Use project name if available, otherwise "project-{id}"
   - Normalize to lowercase, replace spaces with hyphens

3. **Check for Nickname Conflicts**
   - Load all registered projects
   - Check if suggested nickname already exists
   - If no conflict, proceed to register
   - If conflict exists, go to step 4

4. **Resolve Nickname Conflict (if needed)**
   - Use AskUserQuestion to present options:
     - Option 1: Suggested nickname with number appended (e.g., "todu2", "todu3")
     - Option 2: Suggested nickname with different variation
     - Option 3: User can select "Other" to provide custom nickname
   - Get user's choice
   - If still conflicts, ask again

5. **Register the Project**
   - Call `$CLAUDE_PLUGIN_ROOT/core/scripts/register-project.py` with:
     - `--nickname <chosen-nickname>`
     - `--system <github|forgejo|todoist>`
     - `--repo <owner/repo>` (for GitHub/Forgejo)
     - `--project-id <id>` (for Todoist)
   - Return success with registration details

## Example Interactions

**User**: (via sync skill) "Sync evcraddock/rott"
**Skill**:

- Checks if evcraddock/rott is registered → Not found
- Suggests nickname: "rott"
- Checks for conflicts → No conflict
- Registers: `register-project.py --nickname rott --system github --repo evcraddock/rott`
- Returns: "✅ Registered project 'rott' (evcraddock/rott)"

**User**: (via sync skill) "Sync evcraddock/todu"
**Skill**:

- Checks if evcraddock/todu is registered → Already registered as "todu"
- Returns: "Project already registered"

**User**: (via sync skill) "Sync owner/repo-name" (nickname conflict exists)
**Skill**:

- Checks if owner/repo-name is registered → Not found
- Suggests nickname: "repo-name"
- Checks for conflicts → "repo-name" already exists!
- Uses AskUserQuestion:

  ```
  Question: "The nickname 'repo-name' is already in use. Choose a nickname:"
  Options:
    - "repo-name2" (suggested alternative)
    - "repo-name-owner" (variation with owner)
    - [Other - user can type custom]
  ```

- User selects: "repo-name2"
- Registers: `register-project.py --nickname repo-name2 --system github --repo owner/repo-name`
- Returns: "✅ Registered project 'repo-name2' (owner/repo-name)"

## Script Interface

Check if already registered:

```bash
# For GitHub/Forgejo repos
$CLAUDE_PLUGIN_ROOT/core/scripts/list-projects.py --format json | grep "owner/repo"

# For Todoist projects
$CLAUDE_PLUGIN_ROOT/core/scripts/list-projects.py --format json | grep "projectId"
```

Register new project:

```bash
# GitHub/Forgejo
$CLAUDE_PLUGIN_ROOT/core/scripts/register-project.py \
  --nickname <nickname> \
  --system <github|forgejo> \
  --repo <owner/repo>

# Todoist
$CLAUDE_PLUGIN_ROOT/core/scripts/register-project.py \
  --nickname <nickname> \
  --system todoist \
  --project-id <project-id>
```

Returns JSON on success:

```json
{
  "success": true,
  "action": "created",
  "nickname": "rott",
  "system": "github",
  "repo": "evcraddock/rott",
  "projectId": null
}
```

## Nickname Conflict Resolution Flow

When a nickname conflict is detected:

1. **Generate Alternatives**:
   - Numbered: "nickname2", "nickname3", etc.
   - With owner: "nickname-owner"
   - With system: "nickname-gh", "nickname-fg", "nickname-td"

2. **Ask User**:

```python
AskUserQuestion(
    questions=[{
        "question": f"The nickname '{suggested}' is already in use for another project. Choose a nickname for {repo_or_project}:",
        "header": "Nickname",
        "multiSelect": false,
        "options": [
            {
                "label": f"{suggested}2",
                "description": "Add number suffix"
            },
            {
                "label": f"{suggested}-{owner}",
                "description": "Include owner/context in nickname"
            }
        ]
    }]
)
```

3. **Validate Choice**:
   - Check if user's chosen nickname also conflicts
   - If conflicts, ask again with different suggestions
   - Continue until unique nickname is found

## Integration Points

This skill is called by:

- `github:task-sync` - Before syncing GitHub repos
- `forgejo:task-sync` - Before syncing Forgejo repos
- `todoist:task-sync` - Before syncing Todoist projects
- `github:task-create` - Before creating issues in unregistered repos
- `forgejo:task-create` - Before creating issues in unregistered repos
- `todoist:task-create` - Before creating tasks in unregistered projects

## Notes

- Already-registered projects return success immediately (no duplicate registration)
- Nickname suggestions are smart: derived from repo/project name
- Conflict resolution is user-driven via AskUserQuestion
- All registration uses the core register-project.py script
- Registration is persistent in `~/.local/todu/projects.json`
- Nicknames are used throughout the system for quick reference
