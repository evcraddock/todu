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
from datetime import datetime, timezone
import requests

CACHE_DIR = Path.home() / ".local" / "todu" / "forgejo"

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

def normalize_issue(issue, repo_name):
    """Convert Forgejo issue to normalized format."""
    return {
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
            "state": issue['state'],
            "state_reason": issue.get('state_reason', None)
        }
    }

def sync_issues(repo_name, since=None, issue_number=None):
    """Sync Forgejo issues to local cache."""
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

        # Create cache directory
        issues_dir = CACHE_DIR / "issues"
        issues_dir.mkdir(parents=True, exist_ok=True)

        # Use repo name prefix in filename to avoid conflicts
        # Replace '/' with '_' for valid filename
        repo_prefix = repo_name.replace('/', '_')

        # Fetch issues based on mode
        if issue_number:
            # Single issue mode
            api_url = f"{base_url}/api/v1/repos/{repo_name}/issues/{issue_number}"
            response = requests.get(api_url, headers=headers)
            response.raise_for_status()
            issue = response.json()

            # Check if it's a pull request
            if issue.get('pull_request'):
                print(json.dumps({"error": f"Issue #{issue_number} is a pull request, not an issue"}), file=sys.stderr)
                return 1

            issues = [issue]
            sync_mode = "single"
        else:
            # Full or incremental sync mode
            api_url = f"{base_url}/api/v1/repos/{repo_name}/issues"
            params = {
                'state': 'all',
                'page': 1,
                'limit': 100
            }

            if since:
                params['since'] = since.isoformat()
                sync_mode = "incremental"
            else:
                sync_mode = "full"

            issues = []
            while True:
                response = requests.get(api_url, headers=headers, params=params)
                response.raise_for_status()
                page_issues = response.json()

                if not page_issues:
                    break

                # Filter out pull requests
                issues.extend([i for i in page_issues if not i.get('pull_request')])

                params['page'] += 1

        new_count = 0
        updated_count = 0

        for issue in issues:
            # Use repo prefix in filename to avoid conflicts between repos
            issue_file = issues_dir / f"{repo_prefix}-{issue['number']}.json"
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

    except requests.exceptions.RequestException as e:
        import traceback
        error_msg = str(e)
        if hasattr(e, 'response') and e.response is not None:
            error_msg = f"{error_msg}: {e.response.text}"
        error_info = {
            "error": error_msg,
            "type": type(e).__name__,
            "traceback": traceback.format_exc()
        }
        print(json.dumps(error_info), file=sys.stderr)
        return 1
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
    parser = argparse.ArgumentParser(description='Sync Forgejo issues to local cache')
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
