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

def suggest_nickname(query):
    """Suggest a nickname based on the query.

    For repo format (owner/repo), suggest just the repo name.
    Otherwise, use the query as-is.
    """
    if '/' in query:
        # Extract repo name from owner/repo format
        return query.split('/')[-1]
    return query

def resolve_project(nickname):
    """Resolve a project nickname to system and repo/project details."""
    projects = load_projects()

    # Check if nickname exists
    if nickname in projects:
        project = projects[nickname]
        result = {
            "found": True,
            "nickname": nickname,
            "system": project["system"],
            "repo": project.get("repo"),
            "projectId": project.get("projectId"),
            "addedAt": project.get("addedAt")
        }
        print(json.dumps(result, indent=2))
        return 0

    # Not found - suggest a nickname
    suggested = suggest_nickname(nickname)
    result = {
        "found": False,
        "query": nickname,
        "suggested_nickname": suggested
    }
    print(json.dumps(result, indent=2))
    return 0

def main():
    parser = argparse.ArgumentParser(description='Resolve project nickname to system and repo')
    parser.add_argument('nickname', help='Project nickname to resolve')

    args = parser.parse_args()

    return resolve_project(args.nickname)

if __name__ == '__main__':
    sys.exit(main())
