---
name: todoist-task-create
description: MANDATORY skill for creating Todoist tasks. NEVER call scripts/create-task.py directly - ALWAYS use this skill via the Skill tool. Use when user wants to create a Todoist task or personal task. (plugin:todoist@todu)
---

# Create Todoist Task

**⚠️ MANDATORY: ALWAYS invoke this skill via the Skill tool for EVERY create request.**

**NEVER EVER call `create-task.py` directly. This skill provides essential logic beyond just running the script:**

- Extracting git context (current branch, recent commits, modified files) when available
- Prompting for missing information (title, description, project, priority, due date)
- Formatting task description with rich git context when in a git repo
- Handling interactive clarifications

Even if you've invoked this skill before in the conversation, you MUST invoke it again for each new task creation request.

---

This skill creates a Todoist task, optionally with git context from the current environment.

## When to Use

- User explicitly mentions "Todoist", "Todoist task", or "personal task"
- User wants to create a task that's NOT repository-specific (e.g., reminders, personal todos)
- If user doesn't specify a system and task seems personal in nature, ask if they want Todoist
- Todoist is for personal task management, not code issue tracking

## What This Skill Does

1. **Ensure Project is Registered (if project specified)**
   - If user mentions a project nickname or ID
   - Invoke the `core:project-register` skill via the Skill tool
   - The skill will:
     - Check if project is already registered (returns immediately if so)
     - If not registered, generate nickname suggestion and handle conflicts
     - Register the project with user-chosen nickname
   - Use the registered project info for task creation
   - If no project specified, task goes to inbox (no registration needed)

2. **Determine Context**
   - Check if we're in a git repository
   - If yes, offer to include git context in description (optional for Todoist)
   - Git context includes: repo name, branch, recent commits, modified files

3. **Gather Task Details**
   - Prompt for title/content if not provided
   - Prompt for description (can include git context if in repo)
   - Ask about project (or use default/inbox)
   - Ask about priority: low, medium, high (optional)
   - Ask about due date using natural language (optional)
   - Ask about labels (optional)

4. **Create the Task**
   - Call `$PLUGIN_DIR/scripts/create-task.py` with collected information
   - Script returns normalized JSON with task details
   - Display confirmation with task URL
   - DO NOT mention cache updates - this is transparent to the user

5. **Handle Project Selection**
   - If user has multiple projects, list them and ask which one
   - Can use default project from config or environment
   - If no project specified, task goes to inbox

## Example Interactions

**User**: "Create a Todoist task to review PR tomorrow"
**Skill**:

- Checks if in git repo (optional context)
- Prompts: "What should the task title be?"
- User: "Review authentication PR"
- Prompts: "Any additional description?"
- User: "Check security implications"
- Prompts: "Which project? (or press enter for inbox)"
- User: (press enter)
- Prompts: "Priority? (low/medium/high or press enter for none)"
- User: "high"
- Prompts: "Due date? (natural language like 'tomorrow', 'next Monday')"
- User: "tomorrow"
- Creates task with specified details
- Shows: "✅ Created task: <https://todoist.com/app/task/12345678>"

**User**: "Create a task for the bug I'm working on"
**Skill**:

- Detects git repo, extracts branch: `fix/auth-timeout`
- Finds recent commits related to auth
- Prompts: "What should the task title be?"
- User: "Complete auth timeout fix"
- Prompts: "Include git context in description? (y/n)"
- User: "y"
- Builds description with branch, commits, modified files
- Prompts for project, priority, due date
- Creates task and displays confirmation

## Script Interface

```bash
$PLUGIN_DIR/scripts/create-task.py \
  --title "Task title" \
  --description "Task description (can include git context)" \
  --project-id "2203306141" \
  --priority "priority:high" \
  --due-date "tomorrow" \
  --labels "bug,review"
```

Returns JSON:

```json
{
  "id": "12345678",
  "system": "todoist",
  "type": "task",
  "title": "Review authentication PR",
  "description": "...",
  "status": "open",
  "url": "https://todoist.com/app/task/12345678",
  "labels": ["bug", "priority:high"],
  "systemData": {
    "project_id": "2203306141",
    "priority": 4,
    "due": "2025-10-29"
  }
}
```

## Environment Variables

- `TODOIST_TOKEN` (required): Personal API token from <https://todoist.com/app/settings/integrations/developer>

## Notes

- Unlike GitHub/Forgejo, git context is OPTIONAL for Todoist (personal tasks may not be code-related)
- Due dates support natural language: "tomorrow", "next week", "Dec 25", "in 3 days"
- Priorities map: high=4 (urgent), medium=3 (high), low=2 (medium)
- If no project specified, task goes to inbox
- Labels are custom strings, can be anything
