#!/usr/bin/env python3

import argparse
import json
import sys
import subprocess
from pathlib import Path

CACHE_DIR = Path.home() / ".local" / "todu"

def find_in_cache(issue_id):
    """Search local cache for issue/task by ID."""
    matches = []

    # Search GitHub issues
    github_dir = CACHE_DIR / "github" / "issues"
    if github_dir.exists():
        for issue_file in github_dir.glob("*.json"):
            try:
                with open(issue_file) as f:
                    data = json.load(f)
                    if data.get("id") == str(issue_id):
                        matches.append({
                            "system": "github",
                            "repo": data["systemData"]["repo"],
                            "number": data["systemData"]["number"],
                            "title": data["title"]
                        })
            except Exception:
                continue

    # Search Forgejo issues
    forgejo_dir = CACHE_DIR / "forgejo" / "issues"
    if forgejo_dir.exists():
        for issue_file in forgejo_dir.glob("*.json"):
            try:
                with open(issue_file) as f:
                    data = json.load(f)
                    if data.get("id") == str(issue_id):
                        matches.append({
                            "system": "forgejo",
                            "repo": data["systemData"]["repo"],
                            "number": data["systemData"]["number"],
                            "title": data["title"]
                        })
            except Exception:
                continue

    # Search Todoist tasks (by ID string match)
    todoist_dir = CACHE_DIR / "todoist" / "tasks"
    if todoist_dir.exists():
        for task_file in todoist_dir.glob("*.json"):
            try:
                with open(task_file) as f:
                    data = json.load(f)
                    if data.get("id") == str(issue_id):
                        matches.append({
                            "system": "todoist",
                            "task_id": data["id"],
                            "title": data["title"]
                        })
            except Exception:
                continue

    return matches

def view_item(system=None, repo=None, issue_id=None, task_id=None):
    """View an issue or task with all comments."""

    # If we have explicit system info, use it directly
    if system and (repo or task_id):
        if system == "github":
            if not repo or not issue_id:
                print(json.dumps({"error": "GitHub requires --repo and --issue"}), file=sys.stderr)
                return 1
            script = Path(__file__).parent / "github" / "scripts" / "view-issue.py"
            result = subprocess.run([str(script), "--repo", repo, "--issue", str(issue_id)])
            return result.returncode

        elif system == "forgejo":
            if not repo or not issue_id:
                print(json.dumps({"error": "Forgejo requires --repo and --issue"}), file=sys.stderr)
                return 1
            script = Path(__file__).parent / "forgejo" / "scripts" / "view-issue.py"
            result = subprocess.run([str(script), "--repo", repo, "--issue", str(issue_id)])
            return result.returncode

        elif system == "todoist":
            if not task_id:
                print(json.dumps({"error": "Todoist requires --task-id"}), file=sys.stderr)
                return 1
            script = Path(__file__).parent / "todoist" / "scripts" / "view-task.py"
            result = subprocess.run([str(script), "--task-id", task_id])
            return result.returncode

        else:
            print(json.dumps({"error": f"Unknown system: {system}"}), file=sys.stderr)
            return 1

    # Otherwise, search cache for the ID
    search_id = issue_id or task_id
    if not search_id:
        print(json.dumps({"error": "Must provide either --issue or --task-id"}), file=sys.stderr)
        return 1

    matches = find_in_cache(search_id)

    if not matches:
        print(json.dumps({
            "error": f"No cached item found with ID {search_id}",
            "help": "Please specify --system, --repo (for GitHub/Forgejo), or --task-id (for Todoist)"
        }), file=sys.stderr)
        return 1

    if len(matches) > 1:
        print(json.dumps({
            "error": f"Multiple items found with ID {search_id}",
            "matches": matches,
            "help": "Please specify --system and --repo to disambiguate"
        }), file=sys.stderr)
        return 1

    # Single match found - delegate to system-specific script
    match = matches[0]
    if match["system"] == "github":
        script = Path(__file__).parent / "github" / "scripts" / "view-issue.py"
        result = subprocess.run([str(script), "--repo", match["repo"], "--issue", str(match["number"])])
        return result.returncode

    elif match["system"] == "forgejo":
        script = Path(__file__).parent / "forgejo" / "scripts" / "view-issue.py"
        result = subprocess.run([str(script), "--repo", match["repo"], "--issue", str(match["number"])])
        return result.returncode

    elif match["system"] == "todoist":
        script = Path(__file__).parent / "todoist" / "scripts" / "view-task.py"
        result = subprocess.run([str(script), "--task-id", match["task_id"]])
        return result.returncode

    return 1

def main():
    parser = argparse.ArgumentParser(
        description='View issue or task with all comments',
        epilog='Examples:\n'
               '  view.py --issue 123                    # Search cache for issue #123\n'
               '  view.py --system github --repo owner/repo --issue 123\n'
               '  view.py --system todoist --task-id abc123\n',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument('--system', choices=['github', 'forgejo', 'todoist'],
                       help='System type (github, forgejo, todoist)')
    parser.add_argument('--repo', help='Repository in owner/name format (for GitHub/Forgejo)')
    parser.add_argument('--issue', help='Issue number (for GitHub/Forgejo)')
    parser.add_argument('--task-id', help='Task ID (for Todoist)')

    args = parser.parse_args()

    # Validate combinations
    if args.system in ['github', 'forgejo'] and not (args.repo or args.issue):
        if not (args.issue):
            parser.error(f"{args.system} requires --issue (and --repo if not searching cache)")

    if args.system == 'todoist' and not args.task_id:
        parser.error("todoist requires --task-id")

    return view_item(
        system=args.system,
        repo=args.repo,
        issue_id=args.issue,
        task_id=args.task_id
    )

if __name__ == '__main__':
    sys.exit(main())
