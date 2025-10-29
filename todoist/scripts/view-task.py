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
from datetime import datetime
from todoist_api_python.api import TodoistAPI

# Priority mapping: Todoist 1-4 to our labels
PRIORITY_TO_LABEL = {
    4: "priority:high",    # Urgent
    3: "priority:medium",  # High
    2: "priority:low",     # Medium
    1: None                # Normal (no label)
}

def format_task_markdown(task, comments, project_name=None):
    """Format task and comments as markdown."""
    lines = []

    # Title
    lines.append(f"# Task: {task.content}")
    lines.append("")

    # Metadata
    lines.append(f"**System:** Todoist")
    if project_name:
        lines.append(f"**Project:** {project_name}")
    lines.append(f"**Status:** {'completed' if task.is_completed else 'open'}")

    # Build labels list
    task_labels = task.labels if task.labels else []
    priority_label = PRIORITY_TO_LABEL.get(task.priority)
    if priority_label:
        task_labels.append(priority_label)

    if task_labels:
        labels = ", ".join(task_labels)
        lines.append(f"**Labels:** {labels}")

    # Priority
    priority_names = {4: "Urgent", 3: "High", 2: "Medium", 1: "Normal"}
    lines.append(f"**Priority:** {priority_names.get(task.priority, 'Normal')}")

    # Due date
    if task.due:
        due_str = task.due.date if hasattr(task.due, 'date') else str(task.due)
        lines.append(f"**Due:** {due_str}")

    created_at = task.created_at
    if created_at:
        lines.append(f"**Created:** {created_at.strftime('%Y-%m-%d %H:%M:%S')}")

    lines.append(f"**URL:** {task.url}")
    lines.append("")

    # Description
    lines.append("## Description")
    lines.append("")
    lines.append(task.description or "*No description provided*")
    lines.append("")

    # Comments
    lines.append("## Comments")
    lines.append("")

    comment_count = 0
    if comments:
        try:
            for comment in comments:
                # Debug: check what type comment is
                if isinstance(comment, list):
                    # If it's a list, iterate through it
                    for c in comment:
                        comment_count += 1
                        comment_date = c.posted_at
                        lines.append(f"### Comment on {comment_date.strftime('%Y-%m-%d %H:%M:%S')}")
                        lines.append("")
                        lines.append(c.content)
                        lines.append("")
                else:
                    comment_count += 1
                    comment_date = comment.posted_at
                    lines.append(f"### Comment on {comment_date.strftime('%Y-%m-%d %H:%M:%S')}")
                    lines.append("")
                    lines.append(comment.content)
                    lines.append("")
        except Exception as e:
            lines.append(f"*Error loading comments: {e}*")
            lines.append("")

    if comment_count == 0:
        lines.append("*No comments*")
        lines.append("")

    return "\n".join(lines)

def view_task(task_id):
    """Fetch and display task with all comments."""
    token = os.environ.get('TODOIST_TOKEN')
    if not token:
        print(json.dumps({"error": "TODOIST_TOKEN environment variable not set"}), file=sys.stderr)
        sys.exit(1)

    try:
        api = TodoistAPI(token)

        # Fetch task
        task = api.get_task(task_id)

        # Fetch project name if available
        project_name = None
        if task.project_id:
            try:
                project = api.get_project(task.project_id)
                project_name = project.name
            except Exception:
                pass

        # Fetch all comments
        comments = api.get_comments(task_id=task_id)

        # Format as markdown
        markdown = format_task_markdown(task, comments, project_name)
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
    parser = argparse.ArgumentParser(description='View Todoist task with all comments')
    parser.add_argument('--task-id', required=True, help='Task ID')

    args = parser.parse_args()

    return view_task(args.task_id)

if __name__ == '__main__':
    sys.exit(main())
