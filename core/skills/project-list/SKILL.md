---
name: project-list
description: MANDATORY skill for listing registered projects. NEVER call scripts/list-projects.py directly - ALWAYS use this skill via the Skill tool. Use when user wants to list, show, or view registered projects. (plugin:core@todu)
---

# List Registered Projects

**⚠️ MANDATORY: ALWAYS invoke this skill via the Skill tool for EVERY list projects request.**

**NEVER EVER call `list-projects.py` directly. This skill provides essential logic beyond just running the script:**

- Parsing user intent to determine if they want all projects or filtered by system
- Formatting results in user-friendly display
- Handling empty project registry gracefully
- Providing guidance on how to register projects

Even if you've invoked this skill before in the conversation, you MUST invoke it again for each new list request.

---

This skill lists all registered projects from the project registry at `~/.local/todu/projects.json`.

## When to Use

- User explicitly mentions listing/showing/viewing projects
- User wants to see what projects are registered
- User wants to see projects for a specific system (GitHub, Forgejo, Todoist)
- User asks "what projects do I have?"

## What This Skill Does

1. **Determine Filter Context**
   - If user mentions "GitHub projects" - filter to system=github
   - If user mentions "Forgejo projects" - filter to system=forgejo
   - If user mentions "Todoist projects" - filter to system=todoist
   - Otherwise - show ALL registered projects

2. **Load Projects**
   - Call `$PLUGIN_DIR/scripts/list-projects.py` with optional filters
   - Script reads from `~/.local/todu/projects.json`
   - Returns projects in requested format

3. **Display Results**
   - Show projects grouped by system
   - Include nickname, repo/project-id, and registration date
   - Provide clear formatting for easy reading
   - Show count of total registered projects

## Example Interactions

**User**: "Show me my registered projects"
**Skill**:

- Calls: `list-projects.py --format markdown`
- Displays:

  ```
  # Registered Projects (3)

  ## GITHUB

  **todu**
  - Repo: `evcraddock/todu`
  - Added: 2025-10-31T18:30:38.876581+00:00

  ## FORGEJO

  **ishould**
  - Repo: `erik/ishould`
  - Added: 2025-10-31T18:30:29.101649+00:00

  ## TODOIST

  **personal**
  - Project ID: `2203306141`
  - Added: 2025-10-15T10:00:00Z
  ```

**User**: "List my GitHub projects"
**Skill**:

- Extracts: system=github
- Calls: `list-projects.py --format markdown --system github`
- Shows filtered results for GitHub only

**User**: "What projects do I have?"
**Skill**:

- Calls: `list-projects.py --format markdown`
- Shows all registered projects grouped by system

## Script Interface

```bash
# List all projects
$PLUGIN_DIR/scripts/list-projects.py --format markdown

# Filter by specific system
$PLUGIN_DIR/scripts/list-projects.py --system github --format markdown
$PLUGIN_DIR/scripts/list-projects.py --system forgejo --format markdown
$PLUGIN_DIR/scripts/list-projects.py --system todoist --format markdown

# Get JSON output
$PLUGIN_DIR/scripts/list-projects.py --format json
```

Returns JSON:

```json
{
  "projects": [
    {
      "nickname": "todu",
      "system": "github",
      "repo": "evcraddock/todu",
      "addedAt": "2025-10-31T18:30:38.876581+00:00"
    },
    {
      "nickname": "ishould",
      "system": "forgejo",
      "repo": "erik/ishould",
      "addedAt": "2025-10-31T18:30:29.101649+00:00"
    },
    {
      "nickname": "personal",
      "system": "todoist",
      "projectId": "2203306141",
      "addedAt": "2025-10-15T10:00:00Z"
    }
  ],
  "count": 3
}
```

## Search Patterns

Natural language queries the skill should understand:

- "show my projects" → all projects
- "list my projects" → all projects
- "what projects are registered?" → all projects
- "show my GitHub projects" → filter by system=github
- "show my Forgejo projects" → filter by system=forgejo
- "show my Todoist projects" → filter by system=todoist
- "list all registered projects" → all projects

## Empty Registry Handling

If no projects are registered:

- Inform user that no projects are registered
- Provide guidance on how to register a project:

  ```
  Register a project with:
    register-project.py --nickname <name> --system <system> --repo <owner/repo>
  ```

## Display Format

Projects are grouped by system for clarity:

```
# Registered Projects (5)

## GITHUB (2 projects)
**todu**
- Repo: `evcraddock/todu`
- Added: 2025-10-31T18:30:38Z

**example-repo**
- Repo: `user/example-repo`
- Added: 2025-10-30T14:22:10Z

## FORGEJO (2 projects)
**ishould**
- Repo: `erik/ishould`
- Added: 2025-10-31T18:30:29Z

**common-commands**
- Repo: `erik/common-commands`
- Added: 2025-10-29T09:15:00Z

## TODOIST (1 project)
**personal**
- Project ID: `2203306141`
- Added: 2025-10-15T10:00:00Z
```

## Notes

- Projects are stored in `~/.local/todu/projects.json`
- Nicknames are used for quick reference in natural language workflows
- Each project is associated with exactly one system
- Registration dates help track when projects were added
- Use this to see what projects can be used with sync-all or task creation
