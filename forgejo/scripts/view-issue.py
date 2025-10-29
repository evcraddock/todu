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
import requests

def get_forgejo_url(cwd=None):
    """Get Forgejo base URL from git remote in cwd."""
    # Try to extract from git remote in the current directory
    try:
        result = subprocess.run(
            ['git', 'remote', 'get-url', 'origin'],
            capture_output=True,
            text=True,
            check=True,
            cwd=cwd
        )
        remote_url = result.stdout.strip()

        # Parse URL to extract base domain
        # Handle both SSH and HTTPS URLs
        if remote_url.startswith('git@'):
            # SSH format: git@forgejo.example.com:owner/repo.git
            host = remote_url.split('@')[1].split(':')[0]
            base_url = f"https://{host}"
        elif remote_url.startswith('http'):
            # HTTPS format: https://forgejo.example.com/owner/repo.git
            from urllib.parse import urlparse
            parsed = urlparse(remote_url)
            base_url = f"{parsed.scheme}://{parsed.netloc}"
        else:
            base_url = None

        # Reject github.com
        if base_url and 'github.com' in base_url:
            print(json.dumps({
                "error": "This appears to be a GitHub repository, not Forgejo",
                "help": "Use the github plugin for GitHub repositories"
            }), file=sys.stderr)
            sys.exit(1)

        if base_url:
            return base_url
    except Exception:
        pass

    print(json.dumps({
        "error": "Could not detect Forgejo URL from git remote",
        "help": "Make sure you are in a git repository with a Forgejo remote"
    }), file=sys.stderr)
    sys.exit(1)

def format_issue_markdown(issue, comments, repo_name):
    """Format issue and comments as markdown."""
    lines = []

    # Title
    lines.append(f"# Issue #{issue['number']}: {issue['title']}")
    lines.append("")

    # Metadata
    lines.append(f"**System:** Forgejo")
    lines.append(f"**Repository:** {repo_name}")
    lines.append(f"**Status:** {issue['state']}")
    if issue.get('labels'):
        labels = ", ".join([label['name'] for label in issue['labels']])
        lines.append(f"**Labels:** {labels}")
    if issue.get('assignees'):
        assignees = ", ".join([assignee['login'] for assignee in issue['assignees']])
        lines.append(f"**Assignees:** {assignees}")

    created_at = datetime.fromisoformat(issue['created_at'].replace('Z', '+00:00'))
    updated_at = datetime.fromisoformat(issue['updated_at'].replace('Z', '+00:00'))
    lines.append(f"**Created:** {created_at.strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append(f"**Updated:** {updated_at.strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append(f"**URL:** {issue['html_url']}")
    lines.append("")

    # Description
    lines.append("## Description")
    lines.append("")
    lines.append(issue.get('body') or "*No description provided*")
    lines.append("")

    # Comments
    if comments:
        lines.append("## Comments")
        lines.append("")
        for comment in comments:
            comment_date = datetime.fromisoformat(comment['created_at'].replace('Z', '+00:00'))
            lines.append(f"### {comment['user']['login']} commented on {comment_date.strftime('%Y-%m-%d %H:%M:%S')}")
            lines.append("")
            lines.append(comment['body'])
            lines.append("")
    else:
        lines.append("## Comments")
        lines.append("")
        lines.append("*No comments*")
        lines.append("")

    return "\n".join(lines)

def view_issue(repo_name, issue_number):
    """Fetch and display issue with all comments."""
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

        # Fetch issue
        issue_url = f"{base_url}/api/v1/repos/{repo_name}/issues/{issue_number}"
        response = requests.get(issue_url, headers=headers)
        response.raise_for_status()
        issue = response.json()

        # Check if it's a pull request
        if issue.get('pull_request'):
            print(json.dumps({"error": f"Issue #{issue_number} is a pull request, not an issue"}), file=sys.stderr)
            return 1

        # Fetch all comments
        comments_url = f"{base_url}/api/v1/repos/{repo_name}/issues/{issue_number}/comments"
        response = requests.get(comments_url, headers=headers)
        response.raise_for_status()
        comments = response.json()

        # Format as markdown
        markdown = format_issue_markdown(issue, comments, repo_name)
        print(markdown)

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
    parser = argparse.ArgumentParser(description='View Forgejo issue with all comments')
    parser.add_argument('--repo', required=True, help='Repository in owner/name format')
    parser.add_argument('--issue', type=int, required=True, help='Issue number')

    args = parser.parse_args()

    return view_issue(args.repo, args.issue)

if __name__ == '__main__':
    sys.exit(main())
