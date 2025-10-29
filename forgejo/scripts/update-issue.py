#!/usr/bin/env -S uv run
# /// script
# dependencies = [
#   "requests>=2.31.0",
# ]
# requires-python = ">=3.9"
# ///

import argparse
import json
import os
import sys
import subprocess
from pathlib import Path
import requests

# Import shared label utilities
script_dir = Path(__file__).parent
sys.path.insert(0, str(script_dir))
from label_utils import ensure_labels_exist, VALID_STATUSES, VALID_PRIORITIES

def get_forgejo_url():
    """Get Forgejo base URL from environment or git remote."""
    # First check environment variable
    if os.environ.get('FORGEJO_URL'):
        return os.environ['FORGEJO_URL'].rstrip('/')

    # Try to extract from git remote
    try:
        result = subprocess.run(
            ['git', 'remote', 'get-url', 'origin'],
            capture_output=True,
            text=True,
            check=True
        )
        remote_url = result.stdout.strip()

        # Parse URL to extract base domain
        # Handle both SSH and HTTPS URLs
        if remote_url.startswith('ssh://git@'):
            # SSH format: ssh://git@forgejo.example.com/owner/repo.git
            host = remote_url.replace('ssh://git@', '').split('/')[0]
            return f"https://{host}"
        elif remote_url.startswith('git@'):
            # SSH format: git@forgejo.example.com:owner/repo.git
            host = remote_url.split('@')[1].split(':')[0]
            return f"https://{host}"
        elif remote_url.startswith('http'):
            # HTTPS format: https://forgejo.example.com/owner/repo.git
            from urllib.parse import urlparse
            parsed = urlparse(remote_url)
            return f"{parsed.scheme}://{parsed.netloc}"
    except Exception:
        pass

    print(json.dumps({"error": "FORGEJO_URL environment variable not set and could not detect from git remote"}), file=sys.stderr)
    sys.exit(1)

def update_issue(repo_name, issue_number, status=None, priority=None, close=False, cancel=False):
    """Update a Forgejo issue's status, priority, or state."""
    token = os.environ.get('FORGEJO_TOKEN')
    if not token:
        print(json.dumps({"error": "FORGEJO_TOKEN environment variable not set"}), file=sys.stderr)
        sys.exit(1)

    base_url = get_forgejo_url()

    try:
        headers = {
            'Authorization': f'token {token}',
            'Content-Type': 'application/json'
        }

        # Get current issue state
        api_url = f"{base_url}/api/v1/repos/{repo_name}/issues/{issue_number}"
        response = requests.get(api_url, headers=headers)
        response.raise_for_status()
        issue = response.json()

        # Check if it's a pull request
        if issue.get('pull_request'):
            print(json.dumps({"error": f"Issue #{issue_number} is a pull request, not an issue"}), file=sys.stderr)
            return 1

        # Get current labels (as IDs)
        current_label_ids = [label['id'] for label in issue.get('labels', [])]
        current_label_names = [label['name'] for label in issue.get('labels', [])]

        # Handle cancel (sets status:canceled and closes)
        if cancel:
            status = "canceled"
            close = True

        # Handle close without explicit status (defaults to done)
        if close and not status:
            status = "done"

        # Determine which labels we need to add
        required_label_names = []

        # Add new status label
        if status:
            if status not in VALID_STATUSES:
                print(json.dumps({"error": f"Invalid status '{status}'. Valid values: {', '.join(VALID_STATUSES)}"}), file=sys.stderr)
                return 1
            label_name = f"status:{status}"
            required_label_names.append(label_name)

        # Add new priority label
        if priority:
            if priority not in VALID_PRIORITIES:
                print(json.dumps({"error": f"Invalid priority '{priority}'. Valid values: {', '.join(VALID_PRIORITIES)}"}), file=sys.stderr)
                return 1
            label_name = f"priority:{priority}"
            required_label_names.append(label_name)

        # Ensure required labels exist in the repository and get their IDs
        label_map = ensure_labels_exist(base_url, headers, repo_name, required_label_names)

        # Build new label ID list
        new_label_ids = []
        for label_id, label_name in zip(current_label_ids, current_label_names):
            # Remove old status label only if setting new status
            if label_name.startswith('status:') and status:
                continue
            # Remove old priority label only if setting new priority
            if label_name.startswith('priority:') and priority:
                continue
            # Keep all other labels
            new_label_ids.append(label_id)

        # Add new labels by ID
        for label_name in required_label_names:
            if label_name in label_map:
                new_label_ids.append(label_map[label_name])

        # Update labels using dedicated labels endpoint
        if new_label_ids or status or priority:
            labels_url = f"{api_url}/labels"
            labels_payload = {'labels': new_label_ids}
            response = requests.put(labels_url, headers=headers, json=labels_payload)
            response.raise_for_status()

        # Close issue if requested (using PATCH for state)
        if close:
            close_payload = {'state': 'closed'}
            response = requests.patch(api_url, headers=headers, json=close_payload)
            response.raise_for_status()

        # Get updated issue
        response = requests.get(api_url, headers=headers)
        response.raise_for_status()
        issue = response.json()

        # Extract status from status:* label, fallback to state
        labels = [label['name'] for label in issue.get('labels', [])]
        status_value = None
        for label in labels:
            if label.startswith('status:'):
                status_value = label.split(':', 1)[1]
                break

        # If no status label, derive from Forgejo state
        if not status_value:
            status_value = "open" if issue['state'] == "open" else "closed"

        # Return normalized format
        result = {
            "id": str(issue['number']),
            "system": "forgejo",
            "type": "issue",
            "title": issue['title'],
            "description": issue['body'] or "",
            "status": status_value,
            "url": issue['html_url'],
            "createdAt": issue['created_at'],
            "updatedAt": issue['updated_at'],
            "labels": labels,
            "assignees": [assignee['login'] for assignee in (issue.get('assignees') or [])],
            "systemData": {
                "repo": repo_name,
                "number": issue['number'],
                "state": issue['state']
            }
        }

        # Trigger background sync of the updated issue
        try:
            plugin_dir = os.environ.get('PLUGIN_DIR', Path(__file__).parent.parent)
            sync_script = Path(plugin_dir) / "scripts" / "sync-issues.py"

            subprocess.Popen(
                [str(sync_script), "--repo", repo_name, "--issue", str(issue['number'])],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                env=os.environ.copy()
            )
        except Exception as e:
            # Don't fail update if sync fails
            print(f"Warning: Failed to trigger sync: {e}", file=sys.stderr)

        print(json.dumps(result, indent=2))
        return 0

    except requests.exceptions.RequestException as e:
        error_msg = str(e)
        if hasattr(e, 'response') and e.response is not None:
            error_msg = f"{error_msg}: {e.response.text}"
        print(json.dumps({"error": error_msg}), file=sys.stderr)
        return 1
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        return 1

def main():
    parser = argparse.ArgumentParser(description='Update a Forgejo issue status, priority, or state')
    parser.add_argument('--repo', required=True, help='Repository in owner/name format')
    parser.add_argument('--issue', type=int, required=True, help='Issue number to update')
    parser.add_argument('--status', choices=VALID_STATUSES, help='Set issue status')
    parser.add_argument('--priority', choices=VALID_PRIORITIES, help='Set issue priority')
    parser.add_argument('--close', action='store_true', help='Close issue (sets status:done)')
    parser.add_argument('--cancel', action='store_true', help='Cancel issue (sets status:canceled and closes)')

    args = parser.parse_args()

    # Validate that at least one update is requested
    if not any([args.status, args.priority, args.close, args.cancel]):
        parser.error("Must specify at least one of: --status, --priority, --close, or --cancel")

    # Validate --close and --cancel are mutually exclusive
    if args.close and args.cancel:
        parser.error("Cannot specify both --close and --cancel")

    return update_issue(args.repo, args.issue, args.status, args.priority, args.close, args.cancel)

if __name__ == '__main__':
    sys.exit(main())
