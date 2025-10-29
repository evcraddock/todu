#!/usr/bin/env -S uv run
# /// script
# dependencies = [
#   "todoist-api-python>=2.1.0",
# ]
# requires-python = ">=3.9"
# ///

import argparse
import json
import os
import sys
from todoist_api_python.api import TodoistAPI

def create_comment(task_id, body):
    """Create a comment on a Todoist task and return JSON."""
    token = os.environ.get('TODOIST_TOKEN')
    if not token:
        print(json.dumps({"error": "TODOIST_TOKEN environment variable not set"}), file=sys.stderr)
        sys.exit(1)

    try:
        api = TodoistAPI(token)

        # Create the comment
        comment = api.add_comment(
            task_id=task_id,
            content=body
        )

        # Return comment details
        result = {
            "id": comment.id,
            "task_id": task_id,
            "content": comment.content,
            "posted_at": comment.posted_at.isoformat() if comment.posted_at else None,
            "system": "todoist"
        }

        print(json.dumps(result, indent=2))
        return 0

    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        return 1

def main():
    parser = argparse.ArgumentParser(description='Create a comment on a Todoist task')
    parser.add_argument('--task-id', required=True, help='Task ID (UUID)')
    parser.add_argument('--body', required=True, help='Comment body/text')

    args = parser.parse_args()

    return create_comment(args.task_id, args.body)

if __name__ == '__main__':
    sys.exit(main())
