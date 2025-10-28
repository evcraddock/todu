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
from datetime import datetime
from pathlib import Path
from github import Github, Auth

def create_issue(repo_name, title, body, labels=None):
    """Create a GitHub issue and return normalized JSON."""
    token = os.environ.get('GITHUB_TOKEN')
    if not token:
        print(json.dumps({"error": "GITHUB_TOKEN environment variable not set"}), file=sys.stderr)
        sys.exit(1)

    try:
        gh = Github(auth=Auth.Token(token))
        repo = gh.get_repo(repo_name)

        # Create the issue
        issue = repo.create_issue(
            title=title,
            body=body or "",
            labels=labels or []
        )

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

        # Trigger background sync of the newly created issue
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
            # Don't fail issue creation if sync fails
            print(f"Warning: Failed to trigger sync: {e}", file=sys.stderr)

        print(json.dumps(result, indent=2))
        return 0

    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        return 1

def main():
    parser = argparse.ArgumentParser(description='Create a GitHub issue')
    parser.add_argument('--repo', required=True, help='Repository in owner/name format')
    parser.add_argument('--title', required=True, help='Issue title')
    parser.add_argument('--body', help='Issue body/description')
    parser.add_argument('--labels', help='Comma-separated list of labels')

    args = parser.parse_args()

    labels = args.labels.split(',') if args.labels else []

    return create_issue(args.repo, args.title, args.body, labels)

if __name__ == '__main__':
    sys.exit(main())
