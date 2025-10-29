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
from github import Github, Auth

def create_comment(repo_name, issue_number, body):
    """Create a comment on a GitHub issue and return JSON."""
    token = os.environ.get('GITHUB_TOKEN')
    if not token:
        print(json.dumps({"error": "GITHUB_TOKEN environment variable not set"}), file=sys.stderr)
        sys.exit(1)

    try:
        gh = Github(auth=Auth.Token(token))
        repo = gh.get_repo(repo_name)
        issue = repo.get_issue(issue_number)

        # Create the comment
        comment = issue.create_comment(body)

        # Return comment details
        result = {
            "id": comment.id,
            "issue_number": issue_number,
            "author": comment.user.login,
            "body": comment.body,
            "created_at": comment.created_at.isoformat(),
            "updated_at": comment.updated_at.isoformat(),
            "html_url": comment.html_url,
            "system": "github",
            "repo": repo_name
        }

        print(json.dumps(result, indent=2))
        return 0

    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        return 1

def main():
    parser = argparse.ArgumentParser(description='Create a comment on a GitHub issue')
    parser.add_argument('--repo', required=True, help='Repository in owner/name format')
    parser.add_argument('--issue', type=int, required=True, help='Issue number')
    parser.add_argument('--body', required=True, help='Comment body/text')

    args = parser.parse_args()

    return create_comment(args.repo, args.issue, args.body)

if __name__ == '__main__':
    sys.exit(main())
