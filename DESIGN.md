# Todu - Task Management Plugins for Claude Code

## Overview

Todu is a collection of Claude Code plugins that provide unified task
management across multiple platforms. Each plugin follows the official
Claude Code plugin structure with autonomous Skills that Claude invokes
based on context.

## Architecture

### Plugin-Based Approach

Each task system (GitHub, Forgejo, Todoist) is a **separate Claude Code
plugin** that can be installed independently from a shared marketplace.

**Skills** (autonomous) - Claude automatically uses these based on context:

- `{system}-task-create` - Create task with git context (branch, commits, files)
- `{system}-task-sync` - Sync tasks to local cache
- `{system}-task-report` - Generate reports from local data

Skills can be interactive, prompting users for details when needed. All
API access is via existing CLI tools (`gh`, `fj`, `curl`).

### Marketplace Structure

```text
todu/                            # Marketplace root
├── .claude-plugin/
│   └── marketplace.json         # Marketplace metadata
│
├── github/                      # GitHub plugin
│   ├── .claude-plugin/
│   │   └── plugin.json
│   ├── skills/
│   │   ├── task-create/
│   │   │   └── SKILL.md
│   │   ├── task-sync/
│   │   │   └── SKILL.md
│   │   └── task-report/
│   │       └── SKILL.md
│   ├── scripts/
│   │   ├── ensure-uv.sh         # Auto-install uv
│   │   ├── create-issue.py      # Create issue, return normalized JSON
│   │   ├── sync-issues.py       # Sync issues to local cache
│   │   └── list-issues.py       # Query local cache
│   ├── hooks/
│   │   └── hooks.json           # SessionStart hook for uv
│   └── README.md
│
├── forgejo/                     # Forgejo plugin
│   ├── .claude-plugin/
│   │   └── plugin.json
│   ├── skills/
│   │   ├── task-create/
│   │   │   └── SKILL.md
│   │   ├── task-sync/
│   │   │   └── SKILL.md
│   │   └── task-report/
│   │       └── SKILL.md
│   ├── scripts/
│   │   ├── ensure-uv.sh
│   │   ├── create-issue.py
│   │   ├── sync-issues.py
│   │   └── list-issues.py
│   ├── hooks/
│   │   └── hooks.json
│   └── README.md
│
├── todoist/                     # Todoist plugin
│   ├── .claude-plugin/
│   │   └── plugin.json
│   ├── skills/
│   │   ├── task-create/
│   │   │   └── SKILL.md
│   │   ├── task-sync/
│   │   │   └── SKILL.md
│   │   └── task-report/
│   │       └── SKILL.md
│   ├── scripts/
│   │   ├── ensure-uv.sh
│   │   ├── create-task.py
│   │   ├── sync-tasks.py
│   │   └── list-tasks.py
│   ├── hooks/
│   │   └── hooks.json
│   └── README.md
│
└── README.md                    # Marketplace documentation
```

## Plugin Components

### Skills (SKILL.md files)

Each plugin provides three core skills that Claude invokes automatically.
Skills use **system-prefixed names** to avoid collisions.

#### {system}-task-create

**Examples**: `github-task-create`, `forgejo-task-create`, `todoist-task-create`

**Detection Logic**:

- **GitHub**: Use when git remote contains `github.com` OR user mentions GitHub
- **Forgejo**: Use when git remote contains `forgejo`, `gitea`, or `codeberg`
  domains OR user mentions Forgejo
- **Todoist**: Use when user wants personal task, not in git repo, OR mentions
  Todoist
- **If unsure**: Ask the user which system to use

**Capabilities**:

- Extracts git context (repo, branch, recent commits)
- Identifies relevant files being worked on
- Formats task with rich context
- Links to code references
- Can prompt user for missing details (title, description, labels, etc.)

#### {system}-task-sync

**Examples**: `github-task-sync`, `forgejo-task-sync`, `todoist-task-sync`

**Detection Logic**: Use the system that matches current git remote or user's
explicit mention. If unsure, ask the user.

**Capabilities**:

- Fetches recent tasks from system
- Stores locally in `~/.local/todu/{system}/`
- Tracks sync timestamp
- Reports what changed

#### {system}-task-report

**Examples**: `github-task-report`, `forgejo-task-report`, `todoist-task-report`

**Detection Logic**: Use the system the user asks about. Can ask for
clarification if multiple plugins are installed.

**Capabilities**:

- Read-only operations from local cache
- Multiple report formats (markdown, JSON)
- Filter by status, assignee, labels
- Cross-reference with git data
- Can prompt user for additional info when needed (interactive)

## Scripts and Tools

Skills use Python scripts for all task management operations. Scripts handle:

- API interactions (using SDKs where available, or direct API calls)
- Normalization to common JSON format
- Local storage management
- Error handling and retries

### Script Interface

All scripts follow a consistent interface:

```bash
# Create a task
./scripts/create-issue.py --repo owner/repo --title "..." --body "..." --labels "bug"

# Returns normalized JSON:
{
  "id": "123",
  "system": "github",
  "title": "...",
  "status": "open",
  ...
}
```

### Dependencies (PEP 723)

Scripts use inline dependency declarations (PEP 723):

```python
#!/usr/bin/env -S uv run
# /// script
# dependencies = [
#   "PyGithub>=2.1.1",
#   "requests>=2.31.0",
# ]
# requires-python = ">=3.9"
# ///
```

`uv` automatically creates isolated environments and installs dependencies.

### Hooks for Setup

Each plugin includes a SessionStart hook that ensures `uv` is installed:

```json
{
  "sessionStart": {
    "command": "bash",
    "args": ["-c", "$PLUGIN_DIR/scripts/ensure-uv.sh"]
  }
}
```

The hook auto-installs `uv` on first use if not present, requiring zero user
configuration.

## Local Storage

Skills store data in `~/.local/todu/` for caching and offline access:

```text
~/.local/todu/
├── github/
│   ├── issues/
│   │   └── {id}.json
│   └── sync.json
├── forgejo/
│   ├── issues/
│   │   └── {id}.json
│   └── sync.json
└── todoist/
    ├── tasks/
    │   └── {id}.json
    └── sync.json
```

**sync.json** per system tracks sync state:

```json
{
  "lastSync": "2025-10-27T10:30:00Z",
  "taskCount": 45,
  "errors": []
}
```

### Normalized Task Format

Each task is stored in a normalized JSON format for cross-system aggregation:

```json
{
  "id": "123",
  "system": "github",
  "type": "issue",
  "title": "Fix authentication bug",
  "description": "Users can't log in after password reset",
  "status": "open",
  "url": "https://github.com/owner/repo/issues/123",
  "createdAt": "2025-10-27T10:30:00Z",
  "updatedAt": "2025-10-27T15:45:00Z",
  "labels": ["bug", "priority-high"],
  "assignees": ["username"],
  "systemData": {
    "repo": "owner/repo",
    "number": 123,
    "state_reason": "completed"
  }
}
```

**Status Mapping:**

- `"open"` - GitHub "open", Forgejo "open", Todoist "active"
- `"closed"` - GitHub "closed", Forgejo "closed", Todoist "completed"

**Important**: Local storage is a **read-only cache**. The source of truth is
always the remote system. Users update tasks via CLI tools (`gh issue close`,
`fj issue close`, etc.), then sync pulls the updated state.

Skills can read git remotes and environment variables for configuration.
Future phases may add a config file for user preferences.

## Implementation Phases

### Phase 1: Marketplace Setup + GitHub Plugin

**Goal**: Working marketplace with one complete plugin

- [ ] Create marketplace structure (`.claude-plugin/marketplace.json`)
- [ ] Build GitHub plugin:
  - [ ] `plugin.json` with metadata
  - [ ] `github-task-create` skill with git context
  - [ ] `github-task-sync` skill
  - [ ] `github-task-report` skill
  - [ ] Local storage utilities
  - [ ] README and docs
- [ ] Test installation and basic workflows
- [ ] Document plugin development process

**Success Criteria**: Can install GitHub plugin and create issues with rich
context using the task-create skill

### Phase 2: Forgejo Plugin

**Goal**: Second plugin following established patterns

- [ ] Copy GitHub plugin structure and adapt
- [ ] Update skills for Forgejo API specifics (`fj` CLI)
- [ ] Handle Forgejo-specific features (base URL detection)
- [ ] Test with Forgejo instance

**Success Criteria**: Can manage Forgejo issues alongside GitHub issues

### Phase 3: Todoist Plugin

**Goal**: Non-git-forge task system integration

- [ ] Adapt plugin for task-centric (not issue-centric) workflow
- [ ] Implement three skills (create, sync, report)
- [ ] Handle Todoist-specific concepts (projects, priorities, due dates)
- [ ] Test task creation and reporting

**Success Criteria**: Can create and manage Todoist tasks via Claude Code

### Phase 4: Enhanced Features

**Goal**: Cross-plugin capabilities and polish

- [ ] Create cross-system reporting skill (aggregates all systems)
- [ ] Add hooks for automated workflows (e.g., sync on project open)
- [ ] Improve error handling and retry logic
- [ ] Add task templates
- [ ] Add bulk operations
- [ ] Comprehensive testing

**Success Criteria**: Seamless multi-system task management experience

## Technology Choices

### Skills

- **Format**: Markdown files with YAML frontmatter
- **Logic**: Call Python scripts in `scripts/` directory
- **Storage**: JSON files (simple, no dependencies)

### Scripts

- **Language**: Python 3.9+
- **Dependencies**: Inline via PEP 723 (no requirements.txt)
- **Execution**: `uv` (auto-installed via SessionStart hook)
- **Libraries**: PyGithub, requests, forgejo-api, etc.

### Storage Technology

- **Phase 1-3**: JSON files in `~/.local/todu/`
- **Future**: SQLite for better querying if needed

### Hooks

- **SessionStart**: Auto-install `uv` if not present (one-time setup)

## Design Principles

### Independent Plugins

Each plugin is self-contained and can be installed/used independently:

- No shared code dependencies between plugins
- Each has own local storage directory
- Copy and adapt existing plugins when creating new ones

### Skills-Only Approach

All functionality is provided through skills (autonomous):

- Claude decides when to invoke skills based on context
- Skills can be interactive when needed (prompting for details)
- Simpler mental model - no need to remember slash commands
- Natural conversation flow

### Python Scripts for Logic

Use Python scripts for all task operations:

- Scripts handle API interactions, normalization, and storage
- PEP 723 inline dependencies (no external requirements files)
- `uv` auto-installs dependencies in isolated environments
- Consistent interface across all systems
- Easier to test, maintain, and extend than bash

### Fail Gracefully

- If one plugin is broken, others continue working
- Clear error messages reference documentation
- Sync failures don't crash the workflow
- Users can always fall back to direct API access

### Minimal Configuration

Keep configuration simple in Phase 1:

- Use git remote detection for system selection
- Use environment variables for authentication (GITHUB_TOKEN, etc.)
- No hardcoded repos or projects in skills
- Config file can be added in later phases for user preferences

## Design Decisions Made

1. **Skill naming**: System-prefixed names (`github-task-create`,
   `forgejo-task-create`, `todoist-task-create`) to avoid collisions

2. **System detection**: Based on git remote URL + explicit user mentions.
   Claude asks when unsure.

3. **Independent plugins**: No shared code dependencies. Each plugin is
   self-contained and can be installed separately.

4. **Python scripts for logic**: Skills call Python scripts (not CLI tools
   directly). Scripts handle API interactions, normalization, and storage.

5. **PEP 723 + uv**: Scripts use inline dependency declarations (PEP 723).
   `uv` auto-installs on first use via SessionStart hook. Zero user setup.

6. **Configuration**: Not included in Phase 1. Skills use git remote detection
   and environment variables. Config file can be added in later phases.

7. **Local storage as read-only cache**: Local storage (`~/.local/todu/`) is a
   normalized, read-only cache. Source of truth is always the remote system.
   Users update tasks via CLI tools or web UI, then sync pulls updated state.

8. **Normalized task format**: All plugins store tasks in the same JSON
   structure with common fields (id, title, status, etc.) and system-specific
   data in `systemData` field. Enables future cross-system aggregation.

## Open Questions

1. **Shared utilities**: Should we create a shared npm package for common
   logic (JSON storage, git context), or duplicate code across plugins?

2. **Authentication**: Rely on existing tools (gh, fj) for auth, or implement
   our own token management?

3. **Cross-system features**: Should we create a fourth "meta" plugin that
   aggregates all systems, or keep everything separate?

4. **Marketplace hosting**: Where to host the marketplace? GitHub repo?
   Custom server? Both?

## Next Steps

1. Review and approve this design
2. Create `IMPLEMENTATION_PLAN.md` for Phase 1
3. Set up marketplace structure
4. Create plugin templates
5. Begin GitHub plugin implementation
