#!/usr/bin/env -S uv run
# /// script
# dependencies = []
# requires-python = ">=3.9"
# ///

import argparse
import json
import sys
from pathlib import Path
from datetime import datetime, timezone

CACHE_DIR = Path.home() / ".local" / "todu"
PROJECTS_FILE = CACHE_DIR / "projects.json"

def load_projects():
    """Load projects from projects.json."""
    if not PROJECTS_FILE.exists():
        return {}

    try:
        with open(PROJECTS_FILE) as f:
            return json.load(f)
    except Exception as e:
        print(json.dumps({"error": f"Failed to load projects.json: {e}"}), file=sys.stderr)
        return {}

def save_projects(projects):
    """Save projects to projects.json."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    try:
        with open(PROJECTS_FILE, 'w') as f:
            json.dump(projects, f, indent=2)
        return True
    except Exception as e:
        print(json.dumps({"error": f"Failed to save projects.json: {e}"}), file=sys.stderr)
        return False

def register_project(nickname, system, repo=None, project_id=None):
    """Register a project with a nickname."""

    # Validate system
    valid_systems = ['github', 'forgejo', 'todoist']
    if system not in valid_systems:
        print(json.dumps({
            "error": f"Invalid system '{system}'. Must be one of: {', '.join(valid_systems)}"
        }), file=sys.stderr)
        return 1

    # Validate that either repo or project_id is provided
    if system in ['github', 'forgejo'] and not repo:
        print(json.dumps({
            "error": f"--repo is required for system '{system}'"
        }), file=sys.stderr)
        return 1

    if system == 'todoist' and not project_id:
        print(json.dumps({
            "error": "--project-id is required for system 'todoist'"
        }), file=sys.stderr)
        return 1

    # Load existing projects
    projects = load_projects()

    # Check if updating existing project
    is_update = nickname in projects

    # Create project entry
    project_data = {
        "system": system,
        "addedAt": projects.get(nickname, {}).get("addedAt", datetime.now(timezone.utc).isoformat())
    }

    # For Todoist, store project_id in the 'repo' field for consistency
    if system == 'todoist':
        project_data["repo"] = project_id
    elif repo:
        project_data["repo"] = repo

    # Update projects
    projects[nickname] = project_data

    # Save to file
    if not save_projects(projects):
        return 1

    # Return success
    result = {
        "success": True,
        "action": "updated" if is_update else "created",
        "nickname": nickname,
        "system": system,
        "repo": project_id if system == 'todoist' else repo
    }
    print(json.dumps(result, indent=2))
    return 0

def main():
    parser = argparse.ArgumentParser(description='Register a project with a nickname')
    parser.add_argument('--nickname', required=True, help='Nickname for the project')
    parser.add_argument('--system', required=True, choices=['github', 'forgejo', 'todoist'],
                        help='System type')
    parser.add_argument('--repo', help='Repository in owner/name format (for GitHub/Forgejo)')
    parser.add_argument('--project-id', help='Project ID (for Todoist)')

    args = parser.parse_args()

    return register_project(args.nickname, args.system, args.repo, args.project_id)

if __name__ == '__main__':
    sys.exit(main())
