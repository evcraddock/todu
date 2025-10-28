#!/usr/bin/env -S uv run
# /// script
# dependencies = []
# requires-python = ">=3.9"
# ///

import argparse
import json
import sys
from pathlib import Path
from datetime import datetime

CACHE_DIR = Path.home() / ".local" / "todu" / "forgejo"

def list_issues(repo=None, status=None, assignee=None, labels=None, output_format='json'):
    """List issues from local cache with optional filtering."""
    issues_dir = CACHE_DIR / "issues"

    if not issues_dir.exists():
        print(json.dumps({"error": "No cached issues found. Run sync first."}), file=sys.stderr)
        return 1

    # Load all cached issues
    issues = []
    for issue_file in issues_dir.glob("*.json"):
        try:
            with open(issue_file) as f:
                issue = json.load(f)
                issues.append(issue)
        except Exception as e:
            print(f"Warning: Failed to load {issue_file}: {e}", file=sys.stderr)
            continue

    # Apply filters
    if repo:
        issues = [i for i in issues if i.get('systemData', {}).get('repo') == repo]

    if status:
        issues = [i for i in issues if i.get('status') == status]

    if assignee:
        issues = [i for i in issues if assignee in i.get('assignees', [])]

    if labels:
        label_list = labels.split(',')
        issues = [i for i in issues if any(l in i.get('labels', []) for l in label_list)]

    # Sort by updated date (newest first)
    issues.sort(key=lambda x: x.get('updatedAt', ''), reverse=True)

    # Format output
    if output_format == 'json':
        print(json.dumps(issues, indent=2))
    elif output_format == 'markdown':
        print(f"Found {len(issues)} issue(s):\n")
        for issue in issues:
            labels_str = ", ".join(issue.get('labels', []))
            print(f"#{issue['id']}: {issue['title']}")
            if labels_str:
                print(f"  Labels: {labels_str}")
            print(f"  Status: {issue['status']}")
            print(f"  URL: {issue['url']}\n")

    return 0

def main():
    parser = argparse.ArgumentParser(description='List issues from local cache')
    parser.add_argument('--repo', help='Filter by repository (owner/name)')
    parser.add_argument('--status', choices=['open', 'closed'], help='Filter by status')
    parser.add_argument('--assignee', help='Filter by assignee username')
    parser.add_argument('--labels', help='Comma-separated list of labels to filter by')
    parser.add_argument('--format', choices=['json', 'markdown'], default='json', help='Output format')

    args = parser.parse_args()

    return list_issues(
        repo=args.repo,
        status=args.status,
        assignee=args.assignee,
        labels=args.labels,
        output_format=args.format
    )

if __name__ == '__main__':
    sys.exit(main())
