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

def list_projects(output_format='json', system=None):
    """List all registered projects."""
    projects = load_projects()

    if not projects:
        if output_format == 'json':
            print(json.dumps({"projects": [], "count": 0}))
        else:
            print("No projects registered.")
            print("\nRegister a project with:")
            print("  register-project.py --nickname <name> --system <system> --repo <owner/repo>")
        return 0

    # Filter by system if specified
    if system:
        projects = {k: v for k, v in projects.items() if v.get('system') == system}

    if output_format == 'json':
        result = {
            "projects": [
                {
                    "nickname": nickname,
                    **data
                }
                for nickname, data in projects.items()
            ],
            "count": len(projects)
        }
        print(json.dumps(result, indent=2))
    elif output_format == 'markdown':
        print(f"# Registered Projects ({len(projects)})\n")

        # Group by system
        by_system = {}
        for nickname, data in projects.items():
            system_name = data.get('system', 'unknown')
            if system_name not in by_system:
                by_system[system_name] = []
            by_system[system_name].append((nickname, data))

        # Display by system
        for system_name in sorted(by_system.keys()):
            print(f"## {system_name.upper()}\n")
            for nickname, data in sorted(by_system[system_name]):
                repo = data.get('repo')
                project_id = data.get('projectId')
                added_at = data.get('addedAt', 'unknown')

                print(f"**{nickname}**")
                if repo:
                    print(f"- Repo: `{repo}`")
                if project_id:
                    print(f"- Project ID: `{project_id}`")
                print(f"- Added: {added_at}")
                print()

    return 0

def main():
    parser = argparse.ArgumentParser(description='List registered projects')
    parser.add_argument('--format', choices=['json', 'markdown'], default='markdown',
                        help='Output format (default: markdown)')
    parser.add_argument('--system', choices=['github', 'forgejo', 'todoist'],
                        help='Filter by system')

    args = parser.parse_args()

    return list_projects(args.format, args.system)

if __name__ == '__main__':
    sys.exit(main())
