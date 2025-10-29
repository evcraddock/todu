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
from datetime import datetime
from github import Github, Auth

def format_issue_markdown(issue, comments, repo_name):
    """Format issue and comments as markdown."""
    lines = []

    # Title
    lines.append(f"# Issue #{issue.number}: {issue.title}")
    lines.append("")

    # Metadata
    lines.append(f"**System:** GitHub")
    lines.append(f"**Repository:** {repo_name}")
    lines.append(f"**Status:** {issue.state}")
    if issue.labels:
        labels = ", ".join([label.name for label in issue.labels])
        lines.append(f"**Labels:** {labels}")
    if issue.assignees:
        assignees = ", ".join([assignee.login for assignee in issue.assignees])
        lines.append(f"**Assignees:** {assignees}")
    lines.append(f"**Created:** {issue.created_at.strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append(f"**Updated:** {issue.updated_at.strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append(f"**URL:** {issue.html_url}")
    lines.append("")

    # Description
    lines.append("## Description")
    lines.append("")
    lines.append(issue.body or "*No description provided*")
    lines.append("")

    # Comments
    if comments:
        lines.append("## Comments")
        lines.append("")
        for comment in comments:
            lines.append(f"### {comment.user.login} commented on {comment.created_at.strftime('%Y-%m-%d %H:%M:%S')}")
            lines.append("")
            lines.append(comment.body)
            lines.append("")
    else:
        lines.append("## Comments")
        lines.append("")
        lines.append("*No comments*")
        lines.append("")

    return "\n".join(lines)

def view_issue(repo_name, issue_number):
    """Fetch and display issue with all comments."""
    token = os.environ.get('GITHUB_TOKEN')
    if not token:
        print(json.dumps({"error": "GITHUB_TOKEN environment variable not set"}), file=sys.stderr)
        sys.exit(1)

    try:
        gh = Github(auth=Auth.Token(token))
        repo = gh.get_repo(repo_name)

        # Fetch issue
        issue = repo.get_issue(issue_number)

        # Check if it's a pull request
        if issue.pull_request:
            print(json.dumps({"error": f"Issue #{issue_number} is a pull request, not an issue"}), file=sys.stderr)
            return 1

        # Fetch all comments
        comments = list(issue.get_comments())

        # Format as markdown
        markdown = format_issue_markdown(issue, comments, repo_name)
        print(markdown)

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
    parser = argparse.ArgumentParser(description='View GitHub issue with all comments')
    parser.add_argument('--repo', required=True, help='Repository in owner/name format')
    parser.add_argument('--issue', type=int, required=True, help='Issue number')

    args = parser.parse_args()

    return view_issue(args.repo, args.issue)

if __name__ == '__main__':
    sys.exit(main())
