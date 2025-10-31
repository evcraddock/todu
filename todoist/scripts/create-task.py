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
import subprocess
from datetime import datetime
from pathlib import Path
from todoist_api_python.api import TodoistAPI

# Priority mapping: Todoist 1-4 to our labels
PRIORITY_TO_LABEL = {
    4: "priority:high",    # Urgent
    3: "priority:medium",  # High
    2: "priority:low",     # Medium
    1: None                # Normal (no label)
}

LABEL_TO_PRIORITY = {
    "priority:high": 4,
    "priority:medium": 3,
    "priority:low": 2
}

def create_task(title, description=None, project_id=None, priority=None, due_date=None, labels=None):
    """Create a Todoist task and return normalized JSON."""
    token = os.environ.get('TODOIST_TOKEN')
    if not token:
        print(json.dumps({"error": "TODOIST_TOKEN environment variable not set"}), file=sys.stderr)
        sys.exit(1)

    try:
        api = TodoistAPI(token)

        # Convert priority label to Todoist priority number
        todoist_priority = 1  # Default to normal
        if priority:
            todoist_priority = LABEL_TO_PRIORITY.get(priority, 1)

        # Prepare task parameters
        task_params = {
            "content": title,
            "priority": todoist_priority
        }

        if description:
            task_params["description"] = description

        if project_id:
            task_params["project_id"] = project_id

        if due_date:
            task_params["due_string"] = due_date

        if labels:
            task_params["labels"] = labels

        # Create the task
        task = api.add_task(**task_params)

        # Convert Todoist priority to label
        priority_label = PRIORITY_TO_LABEL.get(task.priority)
        task_labels = task.labels if task.labels else []
        if priority_label:
            task_labels.append(priority_label)

        # Convert datetime objects to ISO format strings
        created_at = task.created_at.isoformat() if task.created_at else None
        updated_at = task.updated_at.isoformat() if hasattr(task, 'updated_at') and task.updated_at else created_at

        # Convert due date if present
        due_date = None
        if task.due:
            if hasattr(task.due, 'date'):
                due_date = task.due.date.isoformat() if hasattr(task.due.date, 'isoformat') else str(task.due.date)
            else:
                due_date = str(task.due)

        # Return normalized format
        result = {
            "id": task.id,
            "system": "todoist",
            "type": "task",
            "title": task.content,
            "description": task.description or "",
            "status": "open",  # Newly created tasks are always open
            "url": task.url,
            "createdAt": created_at,
            "updatedAt": updated_at,
            "labels": task_labels,
            "assignees": [],  # Todoist tasks are personal
            "systemData": {
                "project_id": task.project_id,
                "priority": task.priority,
                "due": due_date,
                "is_completed": False
            }
        }

        # Trigger background sync of the newly created task
        try:
            plugin_dir = os.environ.get('PLUGIN_DIR', Path(__file__).parent.parent)
            sync_script = Path(plugin_dir) / "scripts" / "sync-tasks.py"

            subprocess.Popen(
                [str(sync_script), "--task-id", task.id],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                env=os.environ.copy()
            )
        except Exception as e:
            # Don't fail task creation if sync fails
            print(f"Warning: Failed to trigger sync: {e}", file=sys.stderr)

        print(json.dumps(result, indent=2))
        return 0

    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        return 1

def main():
    parser = argparse.ArgumentParser(description='Create a Todoist task')
    parser.add_argument('--title', required=True, help='Task title/content')
    parser.add_argument('--description', help='Task description')
    parser.add_argument('--project-id', required=True, help='Project ID (required, from project registry)')
    parser.add_argument('--priority', choices=['priority:low', 'priority:medium', 'priority:high'],
                       help='Task priority')
    parser.add_argument('--due-date', help='Due date (natural language like "tomorrow" or "next Monday")')
    parser.add_argument('--labels', help='Comma-separated list of labels')

    args = parser.parse_args()

    labels = args.labels.split(',') if args.labels else None

    return create_task(
        title=args.title,
        description=args.description,
        project_id=args.project_id,
        priority=args.priority,
        due_date=args.due_date,
        labels=labels
    )

if __name__ == '__main__':
    sys.exit(main())
