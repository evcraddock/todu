#!/usr/bin/env -S uv run
# /// script
# dependencies = []
# requires-python = ">=3.9"
# ///

import argparse
import json
import sys
from pathlib import Path

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

def update_project(nickname, new_nickname=None, system=None, repo=None, project_id=None, remove_repo=False, remove_project_id=False):
    """Update a project's fields."""

    # Validate system if provided
    if system:
        valid_systems = ['github', 'forgejo', 'todoist']
        if system not in valid_systems:
            print(json.dumps({
                "error": f"Invalid system '{system}'. Must be one of: {', '.join(valid_systems)}"
            }), file=sys.stderr)
            return 1

    # Load existing projects
    projects = load_projects()

    # Check if project exists
    if nickname not in projects:
        print(json.dumps({
            "error": f"Project '{nickname}' not found",
            "success": False
        }), file=sys.stderr)
        return 1

    # Get existing project data
    project_data = projects[nickname].copy()

    # Track what changed
    changes = []

    # Update fields if provided
    if system and system != project_data.get("system"):
        old_system = project_data.get("system")
        project_data["system"] = system
        changes.append(f"system: {old_system} -> {system}")

    if repo is not None and repo != project_data.get("repo"):
        old_repo = project_data.get("repo")
        project_data["repo"] = repo
        changes.append(f"repo: {old_repo} -> {repo}")

    if project_id is not None and project_id != project_data.get("projectId"):
        old_project_id = project_data.get("projectId")
        project_data["projectId"] = project_id
        changes.append(f"projectId: {old_project_id} -> {project_id}")

    # Handle removal of fields
    if remove_repo and "repo" in project_data:
        del project_data["repo"]
        changes.append("removed repo")

    if remove_project_id and "projectId" in project_data:
        del project_data["projectId"]
        changes.append("removed projectId")

    # Handle nickname change
    actual_nickname = nickname
    if new_nickname and new_nickname != nickname:
        if new_nickname in projects:
            print(json.dumps({
                "error": f"Project with nickname '{new_nickname}' already exists",
                "success": False
            }), file=sys.stderr)
            return 1
        del projects[nickname]
        actual_nickname = new_nickname
        changes.append(f"nickname: {nickname} -> {new_nickname}")

    # Check if any changes were made
    if not changes:
        print(json.dumps({
            "error": "No changes specified",
            "success": False
        }), file=sys.stderr)
        return 1

    # Update projects
    projects[actual_nickname] = project_data

    # Save to file
    if not save_projects(projects):
        return 1

    # Return success
    result = {
        "success": True,
        "action": "updated",
        "nickname": actual_nickname,
        "changes": changes,
        "project": project_data
    }
    print(json.dumps(result, indent=2))
    return 0

def main():
    parser = argparse.ArgumentParser(description='Update a registered project')
    parser.add_argument('--nickname', required=True, help='Current nickname of the project')
    parser.add_argument('--new-nickname', help='New nickname for the project')
    parser.add_argument('--system', choices=['github', 'forgejo', 'todoist'],
                        help='Update system type')
    parser.add_argument('--repo', help='Update repository (owner/name format)')
    parser.add_argument('--project-id', help='Update project ID')
    parser.add_argument('--remove-repo', action='store_true', help='Remove repo field')
    parser.add_argument('--remove-project-id', action='store_true', help='Remove projectId field')

    args = parser.parse_args()

    return update_project(
        args.nickname,
        new_nickname=args.new_nickname,
        system=args.system,
        repo=args.repo,
        project_id=args.project_id,
        remove_repo=args.remove_repo,
        remove_project_id=args.remove_project_id
    )

if __name__ == '__main__':
    sys.exit(main())
