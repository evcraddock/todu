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
import subprocess
from pathlib import Path
from github import Github, Auth

# Valid status and priority values
VALID_STATUSES = ["backlog", "in-progress", "done", "canceled"]
VALID_PRIORITIES = ["low", "medium", "high"]

def update_issue(repo_name, issue_number, status=None, priority=None, close=False, cancel=False, title=None, body=None):
    """Update a GitHub issue's status, priority, state, title, or body."""
    token = os.environ.get('GITHUB_TOKEN')
    if not token:
        print(json.dumps({"error": "GITHUB_TOKEN environment variable not set"}), file=sys.stderr)
        sys.exit(1)

    try:
        gh = Github(auth=Auth.Token(token))
        repo = gh.get_repo(repo_name)
        issue = repo.get_issue(issue_number)

        # Check if it's a pull request
        if issue.pull_request:
            print(json.dumps({"error": f"Issue #{issue_number} is a pull request, not an issue"}), file=sys.stderr)
            return 1

        # Get current labels
        current_labels = [label.name for label in issue.labels]

        # Handle cancel (sets status:canceled and closes)
        if cancel:
            status = "canceled"
            close = True

        # Handle close without explicit status (defaults to done)
        if close and not status:
            status = "done"

        # Build new label list
        new_labels = []
        for label in current_labels:
            # Remove old status label only if setting new status
            if label.startswith('status:') and status:
                continue
            # Remove old priority label only if setting new priority
            if label.startswith('priority:') and priority:
                continue
            # Keep all other labels
            new_labels.append(label)

        # Add new status label
        if status:
            if status not in VALID_STATUSES:
                print(json.dumps({"error": f"Invalid status '{status}'. Valid values: {', '.join(VALID_STATUSES)}"}), file=sys.stderr)
                return 1
            new_labels.append(f"status:{status}")

        # Add new priority label
        if priority:
            if priority not in VALID_PRIORITIES:
                print(json.dumps({"error": f"Invalid priority '{priority}'. Valid values: {', '.join(VALID_PRIORITIES)}"}), file=sys.stderr)
                return 1
            new_labels.append(f"priority:{priority}")

        # Update labels
        issue.set_labels(*new_labels)

        # Prepare edit parameters
        edit_params = {}

        # Update title if provided
        if title is not None:
            edit_params['title'] = title

        # Update body if provided
        if body is not None:
            edit_params['body'] = body

        # Close issue if requested
        if close:
            edit_params['state'] = 'closed'

        # Apply edits if any
        if edit_params:
            issue.edit(**edit_params)

        # Refresh issue to get updated state
        issue = repo.get_issue(issue_number)

        # Return normalized format
        result = {
            "id": str(issue.number),
            "system": "github",
            "type": "issue",
            "title": issue.title,
            "description": issue.body or "",
            "status": "open" if issue.state == "open" else "closed",
            "url": issue.html_url,
            "createdAt": issue.created_at.isoformat(),
            "updatedAt": issue.updated_at.isoformat(),
            "labels": [label.name for label in issue.labels],
            "assignees": [assignee.login for assignee in issue.assignees],
            "systemData": {
                "repo": repo_name,
                "number": issue.number,
                "state": issue.state
            }
        }

        # Trigger background sync of the updated issue
        try:
            plugin_dir = os.environ.get('PLUGIN_DIR', Path(__file__).parent.parent)
            sync_script = Path(plugin_dir) / "scripts" / "sync-issues.py"

            subprocess.Popen(
                [str(sync_script), "--repo", repo_name, "--issue", str(issue.number)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                env=os.environ.copy()
            )
        except Exception as e:
            # Don't fail update if sync fails
            print(f"Warning: Failed to trigger sync: {e}", file=sys.stderr)

        print(json.dumps(result, indent=2))
        return 0

    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        return 1

def main():
    parser = argparse.ArgumentParser(description='Update a GitHub issue status, priority, state, title, or body')
    parser.add_argument('--repo', required=True, help='Repository in owner/name format')
    parser.add_argument('--issue', type=int, required=True, help='Issue number to update')
    parser.add_argument('--status', choices=VALID_STATUSES, help='Set issue status')
    parser.add_argument('--priority', choices=VALID_PRIORITIES, help='Set issue priority')
    parser.add_argument('--close', action='store_true', help='Close issue (sets status:done)')
    parser.add_argument('--cancel', action='store_true', help='Cancel issue (sets status:canceled and closes)')
    parser.add_argument('--title', help='Update issue title')
    parser.add_argument('--body', help='Update issue body/description')

    args = parser.parse_args()

    # Validate that at least one update is requested
    if not any([args.status, args.priority, args.close, args.cancel, args.title, args.body]):
        parser.error("Must specify at least one of: --status, --priority, --close, --cancel, --title, or --body")

    # Validate --close and --cancel are mutually exclusive
    if args.close and args.cancel:
        parser.error("Cannot specify both --close and --cancel")

    return update_issue(args.repo, args.issue, args.status, args.priority, args.close, args.cancel, args.title, args.body)

if __name__ == '__main__':
    sys.exit(main())
