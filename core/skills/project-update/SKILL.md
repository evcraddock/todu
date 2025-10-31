---
name: project-update
description: MANDATORY skill for updating registered projects. NEVER call scripts/update-project.py directly - ALWAYS use this skill via the Skill tool. Use when user wants to update, modify, or change a project. (plugin:core@todu)
---

# Update Registered Project

**⚠️ MANDATORY: ALWAYS invoke this skill via the Skill tool for EVERY update project request.**

**NEVER EVER call `update-project.py` directly. This skill provides essential logic beyond just running the script:**

- Showing current project details
- Using AskUserQuestion to let user select which fields to update
- Collecting new values for selected fields
- Validating updates before applying
- Providing clear feedback about changes

Even if you've invoked this skill before in the conversation, you MUST invoke it again for each new update request.

---

This skill updates fields of a registered project in the project registry at `~/.local/todu/projects.json`.

## When to Use

- User explicitly mentions updating/modifying/changing a project
- User says "update project [nickname]"
- User wants to fix incorrect project information
- User wants to rename a project
- User asks to change repo, system, or project-id

## What This Skill Does

1. **Identify Project**
   - Extract the nickname from user's request
   - If not provided, list available projects and ask which to update

2. **Load Current Project Details**
   - Call `$PLUGIN_DIR/scripts/list-projects.py --format json` to get project info
   - Find the project by nickname
   - Display current project details to user

3. **Select Fields to Update**
   - Use AskUserQuestion to ask which fields to update
   - Options: "Nickname", "System", "Repository", "Project ID"
   - Allow multiSelect: true (user can update multiple fields at once)

4. **Collect New Values**
   - For each selected field, ask user for the new value
   - Use AskUserQuestion for system (github/forgejo/todoist)
   - Ask for text input for nickname, repo, or project-id

5. **Confirm and Apply Update**
   - Show summary of changes (old value -> new value)
   - Confirm with user before applying
   - Call `$PLUGIN_DIR/scripts/update-project.py` with appropriate flags
   - Display success message with updated details

## Example Interactions

**User**: "Update the ishould project"
**Skill**:

- Loads projects to find 'ishould'
- Shows current details:

  ```
  Current project details:
  - Nickname: ishould
  - System: github
  - Repo: some-other/repo
  ```

- Uses AskUserQuestion:
  - Question: "Which fields would you like to update?"
  - Options: "Nickname", "System", "Repository", "Project ID"
  - multiSelect: true
- User selects: "Repository"
- Asks: "What is the new repository? (format: owner/repo)"
- User provides: "erik/ishould"
- Shows confirmation:

  ```
  Changes to apply:
  - repo: some-other/repo -> erik/ishould
  ```

- Asks: "Apply these changes?"
- If confirmed: Calls `update-project.py --nickname ishould --repo erik/ishould`
- Shows: "Project 'ishould' updated successfully."

**User**: "Rename ishould to myproject and change the repo"
**Skill**:

- Loads project 'ishould'
- Infers user wants to update nickname and repo
- Shows current details
- Asks for new nickname: "myproject" (or uses extracted value)
- Asks for new repo: "owner/repo"
- Confirms changes
- Calls: `update-project.py --nickname ishould --new-nickname myproject --repo owner/repo`

## Script Interface

```bash
# Update project fields
$PLUGIN_DIR/scripts/update-project.py \
  --nickname <current-nickname> \
  [--new-nickname <new-nickname>] \
  [--system <system>] \
  [--repo <repo>] \
  [--project-id <project-id>] \
  [--remove-repo] \
  [--remove-project-id]
```

Returns JSON on success:

```json
{
  "success": true,
  "action": "updated",
  "nickname": "ishould",
  "changes": [
    "repo: some-other/repo -> erik/ishould"
  ],
  "project": {
    "system": "github",
    "repo": "erik/ishould",
    "addedAt": "2025-10-31T18:30:29.101649+00:00"
  }
}
```

Returns error if not found or no changes:

```json
{
  "error": "Project 'nickname' not found",
  "success": false
}
```

## Field Selection Flow

**CRITICAL**: Use AskUserQuestion to let user choose fields:

```python
AskUserQuestion(
    questions=[{
        "question": "Which fields would you like to update?",
        "header": "Select Fields",
        "multiSelect": true,
        "options": [
            {
                "label": "Nickname",
                "description": f"Current: {current_nickname}"
            },
            {
                "label": "System",
                "description": f"Current: {current_system} (github/forgejo/todoist)"
            },
            {
                "label": "Repository",
                "description": f"Current: {current_repo or 'none'} (owner/repo format)"
            },
            {
                "label": "Project ID",
                "description": f"Current: {current_project_id or 'none'} (for Todoist)"
            }
        ]
    }]
)
```

## Value Collection

For each selected field:

**Nickname**: Ask user for new nickname (text input)

**System**: Use AskUserQuestion:

```python
AskUserQuestion(
    questions=[{
        "question": "What system should this project use?",
        "header": "System Type",
        "multiSelect": false,
        "options": [
            {"label": "GitHub", "description": "GitHub repository"},
            {"label": "Forgejo", "description": "Forgejo/Gitea repository"},
            {"label": "Todoist", "description": "Todoist project"}
        ]
    }]
)
```

**Repository**: Ask user for new repo in owner/repo format

**Project ID**: Ask user for new project ID (Todoist)

## Confirmation Flow

Before applying updates, show summary and confirm:

```
Changes to apply:
- nickname: ishould -> myproject
- repo: some-other/repo -> erik/ishould

Apply these changes? (yes/no)
```

Only proceed if user confirms.

## Search Patterns

Natural language queries the skill should understand:

- "update project [nickname]" → update specific project
- "modify [nickname]" → update specific project
- "change [nickname] repo" → update repo field
- "rename [nickname] to [new-name]" → update nickname
- "fix the [nickname] project" → update any fields

## Error Handling

- **Project not found**: List available projects and suggest correct nickname
- **No changes specified**: Inform user no updates were selected
- **Invalid values**: Show validation error and ask again
- **Duplicate nickname**: If renaming, check new nickname doesn't exist
- **Update failed**: Show error message from script

## Notes

- Updates preserve the original `addedAt` timestamp
- User can update multiple fields in one operation (multiSelect)
- Confirmation is required before applying changes
- User can always cancel during field selection or confirmation
- System validation ensures only valid systems are accepted
- Repo format should be owner/repo for GitHub/Forgejo
