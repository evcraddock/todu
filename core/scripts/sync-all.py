#!/usr/bin/env -S uv run
# /// script
# dependencies = []
# requires-python = ">=3.9"
# ///

import argparse
import json
import subprocess
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

def get_sync_script_path(system):
    """Get the path to the sync script for a given system."""
    # Determine the plugin root directory
    # Assume we're in core/scripts/, so plugin root is two levels up
    script_path = Path(__file__).resolve()
    plugin_root = script_path.parent.parent.parent

    script_paths = {
        'github': plugin_root / 'github' / 'scripts' / 'sync-issues.py',
        'forgejo': plugin_root / 'forgejo' / 'scripts' / 'sync-issues.py',
        'todoist': plugin_root / 'todoist' / 'scripts' / 'sync-tasks.py'
    }

    return script_paths.get(system)

def sync_project(nickname, project_data):
    """Sync a single project."""
    system = project_data.get('system')
    repo = project_data.get('repo')
    project_id = project_data.get('projectId')

    # Get sync script path
    sync_script = get_sync_script_path(system)

    if not sync_script or not sync_script.exists():
        return {
            "nickname": nickname,
            "system": system,
            "success": False,
            "error": f"Sync script not found for system '{system}'"
        }

    # Build command
    cmd = [str(sync_script)]

    if system in ['github', 'forgejo']:
        if not repo:
            return {
                "nickname": nickname,
                "system": system,
                "success": False,
                "error": "Repo not specified"
            }
        cmd.extend(['--repo', repo])
    elif system == 'todoist':
        if project_id:
            cmd.extend(['--project-id', project_id])

    # Execute sync
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120  # 2 minute timeout per project
        )

        if result.returncode == 0:
            # Parse sync result
            try:
                sync_result = json.loads(result.stdout)
                return {
                    "nickname": nickname,
                    "system": system,
                    "success": True,
                    "synced": sync_result.get('synced', 0),
                    "new": sync_result.get('new', 0),
                    "updated": sync_result.get('updated', 0)
                }
            except json.JSONDecodeError:
                return {
                    "nickname": nickname,
                    "system": system,
                    "success": True,
                    "output": result.stdout
                }
        else:
            return {
                "nickname": nickname,
                "system": system,
                "success": False,
                "error": result.stderr or result.stdout
            }

    except subprocess.TimeoutExpired:
        return {
            "nickname": nickname,
            "system": system,
            "success": False,
            "error": "Sync timed out after 2 minutes"
        }
    except Exception as e:
        return {
            "nickname": nickname,
            "system": system,
            "success": False,
            "error": str(e)
        }

def sync_all(verbose=False):
    """Sync all registered projects."""
    projects = load_projects()

    if not projects:
        print(json.dumps({"error": "No projects registered. Use register-project.py first."}), file=sys.stderr)
        return 1

    results = []
    total_synced = 0
    total_new = 0
    total_updated = 0
    success_count = 0
    error_count = 0

    for nickname, project_data in projects.items():
        if verbose:
            print(f"Syncing {nickname} ({project_data.get('system')})...", file=sys.stderr)

        result = sync_project(nickname, project_data)
        results.append(result)

        if result['success']:
            success_count += 1
            total_synced += result.get('synced', 0)
            total_new += result.get('new', 0)
            total_updated += result.get('updated', 0)
        else:
            error_count += 1

    # Output summary
    summary = {
        "total_projects": len(projects),
        "successful": success_count,
        "failed": error_count,
        "total_synced": total_synced,
        "total_new": total_new,
        "total_updated": total_updated,
        "results": results
    }

    print(json.dumps(summary, indent=2))

    # Return error code if any syncs failed
    return 0 if error_count == 0 else 1

def main():
    parser = argparse.ArgumentParser(description='Sync all registered projects')
    parser.add_argument('--verbose', '-v', action='store_true',
                        help='Show verbose output during sync')

    args = parser.parse_args()

    return sync_all(args.verbose)

if __name__ == '__main__':
    sys.exit(main())
