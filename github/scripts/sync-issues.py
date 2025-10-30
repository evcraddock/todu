#!/usr/bin/env -S uv run
# /// script
# dependencies = [
#   "PyGithub>=2.1.1",
# ]
# requires-python = ">=3.9"
# ///

import argparse
import json
import os
import sys
from pathlib import Path
from datetime import datetime, timezone
from github import Github, Auth

CACHE_DIR = Path.home() / ".local" / "todu" / "github"

def normalize_issue(issue, repo_name):
    """Convert GitHub issue to normalized format."""
    # Extract label names first
    label_names = [label.name for label in issue.labels]

    # Extract standardized status from labels
    status = None
    for label in label_names:
        if label.startswith("status:"):
            status = label.split(":", 1)[1]
            break

    # Fall back to GitHub state if no status label
    if not status:
        status = "open" if issue.state == "open" else "closed"

    # Add completedAt timestamp for completed issues (NOT canceled)
    completed_at = None
    if issue.state == "closed" and status not in ["canceled"]:
        # Use closed_at if available, otherwise fall back to updated_at
        if hasattr(issue, 'closed_at') and issue.closed_at:
            completed_at = issue.closed_at.isoformat()
        else:
            completed_at = issue.updated_at.isoformat()

    # Extract standardized priority from labels
    priority = None
    for label in label_names:
        if label.startswith("priority:"):
            priority = label.split(":", 1)[1]
            break

    normalized = {
        "id": str(issue.number),
        "system": "github",
        "type": "issue",
        "title": issue.title,
        "description": issue.body or "",
        "status": status,
        "url": issue.html_url,
        "createdAt": issue.created_at.isoformat(),
        "updatedAt": issue.updated_at.isoformat(),
        "labels": label_names,
        "assignees": [assignee.login for assignee in issue.assignees],
        "priority": priority,  # Standardized priority field
        "dueDate": None,  # GitHub issues don't have due dates
        "systemData": {
            "repo": repo_name,
            "number": issue.number,
            "state": issue.state,
            "state_reason": getattr(issue, 'state_reason', None)
        }
    }

    # Only include completedAt if the issue is closed
    if completed_at:
        normalized["completedAt"] = completed_at

    return normalized

def sync_issues(repo_name, since=None, issue_number=None):
    """Sync GitHub issues to local cache."""
    token = os.environ.get('GITHUB_TOKEN')
    if not token:
        print(json.dumps({"error": "GITHUB_TOKEN environment variable not set"}), file=sys.stderr)
        sys.exit(1)

    try:
        gh = Github(auth=Auth.Token(token))
        repo = gh.get_repo(repo_name)

        # Create cache directories
        issues_dir = CACHE_DIR / "issues"
        issues_dir.mkdir(parents=True, exist_ok=True)

        # Use repo name prefix in filename to avoid conflicts
        # Replace '/' with '_' for valid filename
        repo_prefix = repo_name.replace('/', '_')

        # Fetch issues based on mode
        if issue_number:
            # Single issue mode
            issue = repo.get_issue(issue_number)
            if issue.pull_request:
                print(json.dumps({"error": f"Issue #{issue_number} is a pull request, not an issue"}), file=sys.stderr)
                return 1
            issues = [issue]
            sync_mode = "single"
        elif since:
            # Incremental sync mode
            issues = repo.get_issues(state='all', since=since)
            sync_mode = "incremental"
        else:
            # Full sync mode
            issues = repo.get_issues(state='all')
            sync_mode = "full"

        new_count = 0
        updated_count = 0

        for issue in issues:
            # Skip pull requests
            if issue.pull_request:
                continue

            # Use repo prefix in filename to avoid conflicts between repos
            issue_file = issues_dir / f"{repo_prefix}-{issue.number}.json"
            is_new = not issue_file.exists()

            # Save normalized issue
            normalized = normalize_issue(issue, repo_name)
            with open(issue_file, 'w') as f:
                json.dump(normalized, f, indent=2)

            if is_new:
                new_count += 1
            else:
                updated_count += 1

        # Update sync metadata
        sync_file = CACHE_DIR / "sync.json"
        sync_data = {
            "lastSync": datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
            "lastSyncMode": sync_mode,
            "taskCount": new_count + updated_count,
            "errors": []
        }
        with open(sync_file, 'w') as f:
            json.dump(sync_data, f, indent=2)

        result = {
            "synced": new_count + updated_count,
            "new": new_count,
            "updated": updated_count,
            "timestamp": sync_data["lastSync"],
            "mode": sync_mode
        }

        # Add issue number for single issue sync
        if issue_number:
            result["issue"] = f"#{issue_number}"

        print(json.dumps(result, indent=2))
        return 0

    except Exception as e:
        import traceback
        error_info = {
            "error": str(e),
            "type": type(e).__name__,
            "traceback": traceback.format_exc()
        }
        print(json.dumps(error_info), file=sys.stderr)
        return 1

def main():
    parser = argparse.ArgumentParser(description='Sync GitHub issues to local cache')
    parser.add_argument('--repo', required=True, help='Repository in owner/name format')
    parser.add_argument('--since', help='ISO timestamp to fetch issues since')
    parser.add_argument('--issue', type=int, help='Sync specific issue number')

    args = parser.parse_args()

    # Make --issue and --since mutually exclusive
    if args.issue and args.since:
        parser.error("Cannot specify both --issue and --since")

    since = datetime.fromisoformat(args.since.replace('Z', '+00:00')) if args.since else None

    return sync_issues(args.repo, since, args.issue)

if __name__ == '__main__':
    sys.exit(main())
