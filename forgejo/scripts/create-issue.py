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
from datetime import datetime
from pathlib import Path
import requests

# Import shared label utilities
script_dir = Path(__file__).parent
sys.path.insert(0, str(script_dir))
from label_utils import ensure_labels_exist, get_label_ids

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
        if remote_url.startswith('git@'):
            # SSH format: git@forgejo.caradoc.com:owner/repo.git
            host = remote_url.split('@')[1].split(':')[0]
            return f"https://{host}"
        elif remote_url.startswith('http'):
            # HTTPS format: https://forgejo.caradoc.com/owner/repo.git
            from urllib.parse import urlparse
            parsed = urlparse(remote_url)
            return f"{parsed.scheme}://{parsed.netloc}"
    except Exception:
        pass

    print(json.dumps({"error": "FORGEJO_URL environment variable not set and could not detect from git remote"}), file=sys.stderr)
    sys.exit(1)

def create_issue(repo_name, title, body, labels=None):
    """Create a Forgejo issue and return normalized JSON."""
    token = os.environ.get('FORGEJO_TOKEN')
    if not token:
        print(json.dumps({"error": "FORGEJO_TOKEN environment variable not set"}), file=sys.stderr)
        sys.exit(1)

    base_url = get_forgejo_url()

    try:
        # Forgejo API endpoint for creating issues
        api_url = f"{base_url}/api/v1/repos/{repo_name}/issues"

        headers = {
            'Authorization': f'token {token}',
            'Content-Type': 'application/json'
        }

        # ALWAYS ensure all standard labels exist in the repository
        from label_utils import VALID_STATUSES, VALID_PRIORITIES
        all_standard_labels = (
            [f"status:{s}" for s in VALID_STATUSES] +
            [f"priority:{p}" for p in VALID_PRIORITIES]
        )
        ensure_labels_exist(base_url, headers, repo_name, all_standard_labels)

        payload = {
            'title': title,
            'body': body or "",
        }

        if labels:
            # Get label IDs for the requested labels
            # Forgejo API requires label IDs, not names
            label_map = ensure_labels_exist(base_url, headers, repo_name, labels)
            label_ids = [label_map[name] for name in labels if name in label_map]
            if label_ids:
                payload['labels'] = label_ids

        response = requests.post(api_url, headers=headers, json=payload)
        response.raise_for_status()

        issue = response.json()

        # Return normalized format
        result = {
            "id": str(issue['number']),
            "system": "forgejo",
            "type": "issue",
            "title": issue['title'],
            "description": issue['body'] or "",
            "status": "open" if issue['state'] == "open" else "closed",
            "url": issue['html_url'],
            "createdAt": issue['created_at'],
            "updatedAt": issue['updated_at'],
            "labels": [label['name'] for label in issue.get('labels', [])],
            "assignees": [assignee['login'] for assignee in (issue.get('assignees') or [])],
            "systemData": {
                "repo": repo_name,
                "number": issue['number'],
                "state": issue['state']
            }
        }

        # Trigger background sync of the newly created issue
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
            # Don't fail issue creation if sync fails
            print(f"Warning: Failed to trigger sync: {e}", file=sys.stderr)

        print(json.dumps(result, indent=2))
        return 0

    except requests.exceptions.RequestException as e:
        error_msg = str(e)
        if hasattr(e.response, 'text'):
            error_msg = f"{error_msg}: {e.response.text}"
        print(json.dumps({"error": error_msg}), file=sys.stderr)
        return 1
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        return 1

def main():
    parser = argparse.ArgumentParser(description='Create a Forgejo issue')
    parser.add_argument('--repo', required=True, help='Repository in owner/name format')
    parser.add_argument('--title', required=True, help='Issue title')
    parser.add_argument('--body', help='Issue body/description')
    parser.add_argument('--labels', help='Comma-separated list of labels')

    args = parser.parse_args()

    labels = args.labels.split(',') if args.labels else []

    return create_issue(args.repo, args.title, args.body, labels)

if __name__ == '__main__':
    sys.exit(main())
