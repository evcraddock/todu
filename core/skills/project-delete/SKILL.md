---
name: project-delete
description: MANDATORY skill for deleting registered projects. NEVER call scripts/delete-project.py directly - ALWAYS use this skill via the Skill tool. Use when user wants to delete, remove, or unregister a project. (plugin:core@todu)
---

# Delete Registered Project

**⚠️ MANDATORY: ALWAYS invoke this skill via the Skill tool for EVERY delete project request.**

**NEVER EVER call `delete-project.py` directly. This skill provides essential logic beyond just running the script:**

- Confirming deletion with the user using AskUserQuestion
- Displaying project details before deletion
- Handling errors gracefully
- Providing clear feedback about the deletion

Even if you've invoked this skill before in the conversation, you MUST invoke it again for each new delete request.

---

This skill deletes a registered project from the project registry at `~/.local/todu/projects.json`.

## When to Use

- User explicitly mentions deleting/removing/unregistering a project
- User says "delete project [nickname]"
- User wants to remove a fake or test project
- User asks to remove a project from the registry

## What This Skill Does

1. **Identify Project**
   - Extract the nickname from user's request
   - If not provided, list available projects and ask which to delete

2. **Load Project Details**
   - Call `$PLUGIN_DIR/scripts/list-projects.py --format json` to get project info
   - Find the project by nickname
   - Display project details to user

3. **Confirm Deletion**
   - Use AskUserQuestion to confirm deletion
   - Show project details: nickname, system, repo/project-id
   - Ask: "Are you sure you want to delete this project?"
   - Mention that associated cached issues will also be deleted
   - Options: "Yes, delete everything" or "No, cancel"

4. **Delete Project and Issues**
   - If confirmed, call `$PLUGIN_DIR/scripts/delete-project.py --nickname <nickname>`
   - Script deletes project from registry
   - Script also deletes all cached issue files from `~/.local/todu/issues/`
   - Display success message with deleted project details and issue count
   - If cancelled, inform user no changes were made

## Example Interactions

**User**: "Delete the ishould project"
**Skill**:

- Loads projects to find 'ishould'
- Shows project details:

  ```
  Project to delete:
  - Nickname: ishould
  - System: github
  - Repo: some-other/repo

  This will also delete all cached issues for this project.
  ```

- Uses AskUserQuestion with:
  - Question: "Are you sure you want to delete the 'ishould' project and its cached issues?"
  - Options: "Yes, delete everything" / "No, cancel"
- If "Yes": Calls `delete-project.py --nickname ishould`
- Shows: "Project 'ishould' has been deleted successfully. Removed 5 cached issue files."

**User**: "Remove the test project"
**Skill**:

- Loads projects to find 'test'
- If not found: "Project 'test' not found. Available projects: [list]"
- If found: Confirms and deletes as above

## Script Interface

```bash
# Delete a project by nickname (also deletes cached issues)
$PLUGIN_DIR/scripts/delete-project.py --nickname <nickname>

# Delete a project but keep cached issues
$PLUGIN_DIR/scripts/delete-project.py --nickname <nickname> --keep-issues
```

Returns JSON on success:

```json
{
  "success": true,
  "action": "deleted",
  "nickname": "ishould",
  "system": "github",
  "repo": "some-other/repo",
  "projectId": null,
  "issuesDeleted": 5
}
```

Returns error if not found:

```json
{
  "error": "Project 'nickname' not found",
  "success": false
}
```

## Issue Cleanup Behavior

By default, deleting a project also removes all cached issue files from `~/.local/todu/issues/`:

- **GitHub/Forgejo**: Deletes all files matching `{system}-{owner}_{repo}-*.json`
  - Example: Deleting `ishould` (repo: `erik/ishould`) removes all `forgejo-erik_ishould-*.json` files

- **Todoist**: Reads each `todoist-*.json` file and deletes those with matching `systemData.project_id`
  - Example: Deleting project with ID `6c4gPChcmrqjWxpM` removes all tasks belonging to that project

Use `--keep-issues` flag to skip issue cleanup and only remove the project from the registry.

## Confirmation Flow

**CRITICAL**: Always use AskUserQuestion before deletion:

```python
AskUserQuestion(
    questions=[{
        "question": f"Are you sure you want to delete the '{nickname}' project from {system}? This will also delete all cached issues.",
        "header": "Confirm Delete",
        "multiSelect": false,
        "options": [
            {
                "label": "Yes, delete everything",
                "description": "Permanently remove this project and its cached issues"
            },
            {
                "label": "No, cancel",
                "description": "Keep the project and issues"
            }
        ]
    }]
)
```

Only proceed with deletion if user selects "Yes, delete everything".

## Search Patterns

Natural language queries the skill should understand:

- "delete project [nickname]" → delete specific project
- "remove [nickname]" → delete specific project
- "unregister [nickname]" → delete specific project
- "delete the [nickname] project" → delete specific project
- "get rid of [nickname]" → delete specific project

## Error Handling

- **Project not found**: List available projects and suggest correct nickname
- **No projects registered**: Inform user registry is empty
- **Delete failed**: Show error message from script

## Notes

- Deletion is permanent - project must be re-registered if needed
- By default, also deletes all cached issue files for the project
- Use `--keep-issues` flag if you want to preserve cached issues
- Does not affect the actual repository/project, only the local registry and cache
- Confirmation is mandatory to prevent accidental deletions
- User can always cancel during confirmation
- Issue cleanup happens after project removal from registry
