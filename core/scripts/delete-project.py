#!/usr/bin/env -S uv run
# /// script
# dependencies = []
# requires-python = ">=3.9"
# ///

import argparse
import json
import sys
from pathlib import Path
import glob

CACHE_DIR = Path.home() / ".local" / "todu"
PROJECTS_FILE = CACHE_DIR / "projects.json"
ISSUES_DIR = CACHE_DIR / "issues"

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

def cleanup_issue_files(system, repo=None, project_id=None):
    """Delete issue files associated with a project."""
    if not ISSUES_DIR.exists():
        return 0

    deleted_count = 0

    try:
        if system in ['github', 'forgejo'] and repo:
            # For GitHub/Forgejo, match pattern: {system}-{owner}_{repo}-*.json
            owner_repo = repo.replace('/', '_')
            pattern = f"{system}-{owner_repo}-*.json"
            matching_files = ISSUES_DIR.glob(pattern)

            for file_path in matching_files:
                file_path.unlink()
                deleted_count += 1

        elif system == 'todoist' and project_id:
            # For Todoist, need to read each file and check project_id
            todoist_files = ISSUES_DIR.glob("todoist-*.json")

            for file_path in todoist_files:
                try:
                    with open(file_path) as f:
                        data = json.load(f)
                        if data.get('systemData', {}).get('project_id') == project_id:
                            file_path.unlink()
                            deleted_count += 1
                except Exception:
                    # Skip files that can't be read
                    continue

    except Exception as e:
        print(json.dumps({"warning": f"Error cleaning up issue files: {e}"}), file=sys.stderr)

    return deleted_count

def delete_project(nickname, keep_issues=False):
    """Delete a project by nickname."""

    # Load existing projects
    projects = load_projects()

    # Check if project exists
    if nickname not in projects:
        print(json.dumps({
            "error": f"Project '{nickname}' not found",
            "success": False
        }), file=sys.stderr)
        return 1

    # Store project data before deletion for return info
    project_data = projects[nickname]

    # Delete the project
    del projects[nickname]

    # Save to file
    if not save_projects(projects):
        return 1

    # Clean up associated issue files unless keep_issues is True
    issues_deleted = 0
    if not keep_issues:
        issues_deleted = cleanup_issue_files(
            system=project_data.get("system"),
            repo=project_data.get("repo"),
            project_id=project_data.get("projectId")
        )

    # Return success
    result = {
        "success": True,
        "action": "deleted",
        "nickname": nickname,
        "system": project_data.get("system"),
        "repo": project_data.get("repo"),
        "projectId": project_data.get("projectId"),
        "issuesDeleted": issues_deleted
    }
    print(json.dumps(result, indent=2))
    return 0

def main():
    parser = argparse.ArgumentParser(description='Delete a registered project')
    parser.add_argument('--nickname', required=True, help='Nickname of the project to delete')
    parser.add_argument('--keep-issues', action='store_true',
                        help='Keep cached issue files (default: delete them)')

    args = parser.parse_args()

    return delete_project(args.nickname, keep_issues=args.keep_issues)

if __name__ == '__main__':
    sys.exit(main())
