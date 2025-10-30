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
from pathlib import Path
from datetime import datetime, timezone
from todoist_api_python.api import TodoistAPI

CACHE_DIR = Path.home() / ".local" / "todu" / "todoist"

# Priority mapping: Todoist 1-4 to our labels
PRIORITY_TO_LABEL = {
    4: "priority:high",    # Urgent
    3: "priority:medium",  # High
    2: "priority:low",     # Medium
    1: None                # Normal (no label)
}

def normalize_task(task):
    """Convert Todoist task to normalized format."""
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

    # Determine normalized status from labels
    # Priority: status:canceled > status:done > status:in-progress > status:backlog > default
    status = "open"
    if task.is_completed:
        # Check for status labels to determine the actual status
        if "status:canceled" in task_labels:
            status = "canceled"
        elif "status:done" in task_labels:
            status = "done"
        else:
            # Completed but no status label, default to done
            status = "done"
    else:
        # Not completed, check for in-progress or backlog
        if "status:in-progress" in task_labels:
            status = "in-progress"
        elif "status:backlog" in task_labels:
            status = "backlog"

    # Add completedAt timestamp for completed tasks
    completed_at = None
    if status in ["done", "canceled"]:
        # Use completed_at if available, otherwise fall back to updated_at
        if hasattr(task, 'completed_at') and task.completed_at:
            completed_at = task.completed_at.isoformat() if hasattr(task.completed_at, 'isoformat') else str(task.completed_at)
        else:
            completed_at = updated_at

    # Standardized priority field
    priority_value = None
    if task.priority == 4:
        priority_value = "high"
    elif task.priority == 3:
        priority_value = "medium"
    elif task.priority == 2:
        priority_value = "low"

    normalized = {
        "id": task.id,
        "system": "todoist",
        "type": "task",
        "title": task.content,
        "description": task.description or "",
        "status": status,
        "url": task.url,
        "createdAt": created_at,
        "updatedAt": updated_at,
        "labels": task_labels,
        "assignees": [],  # Todoist tasks are personal
        "priority": priority_value,  # Standardized priority field
        "dueDate": due_date,  # Standardized due date field
        "systemData": {
            "project_id": task.project_id,
            "priority": task.priority,
            "due": due_date,
            "is_completed": task.is_completed
        }
    }

    # Only include completedAt if the task is completed
    if completed_at:
        normalized["completedAt"] = completed_at

    return normalized

def sync_tasks(project_id=None, task_id=None):
    """Sync Todoist tasks to local cache."""
    token = os.environ.get('TODOIST_TOKEN')
    if not token:
        print(json.dumps({"error": "TODOIST_TOKEN environment variable not set"}), file=sys.stderr)
        sys.exit(1)

    try:
        api = TodoistAPI(token)

        # Create cache directories
        tasks_dir = CACHE_DIR / "tasks"
        tasks_dir.mkdir(parents=True, exist_ok=True)

        # Fetch tasks based on mode
        if task_id:
            # Single task mode
            try:
                task = api.get_task(task_id)
                tasks = [task]
                sync_mode = "single"
            except Exception as e:
                print(json.dumps({"error": f"Failed to fetch task {task_id}: {str(e)}"}), file=sys.stderr)
                return 1
        else:
            # Full sync mode (get all active tasks)
            # Note: Todoist API by default returns only active (non-completed) tasks
            # get_tasks() returns a ResultsPaginator that yields pages (lists) of tasks
            tasks_result = api.get_tasks(project_id=project_id) if project_id else api.get_tasks()
            # Flatten the pages into a single list of tasks
            tasks = []
            for page in tasks_result:
                tasks.extend(page)
            sync_mode = "full"

        new_count = 0
        updated_count = 0

        for task in tasks:
            task_file = tasks_dir / f"{task.id}.json"
            is_new = not task_file.exists()

            # Save normalized task
            normalized = normalize_task(task)
            with open(task_file, 'w') as f:
                json.dump(normalized, f, indent=2)

            if is_new:
                new_count += 1
            else:
                updated_count += 1

        # Update sync metadata
        sync_file = CACHE_DIR / "sync.json"
        sync_metadata = {
            "lastSync": datetime.now(timezone.utc).isoformat(),
            "mode": sync_mode,
            "project_id": project_id,
            "stats": {
                "new": new_count,
                "updated": updated_count,
                "total": new_count + updated_count
            }
        }

        with open(sync_file, 'w') as f:
            json.dump(sync_metadata, f, indent=2)

        # Return stats
        result = {
            "synced": sync_metadata["stats"]["total"],
            "new": new_count,
            "updated": updated_count,
            "timestamp": sync_metadata["lastSync"]
        }

        print(json.dumps(result, indent=2))
        return 0

    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        return 1

def main():
    parser = argparse.ArgumentParser(description='Sync Todoist tasks to local cache')
    parser.add_argument('--project-id', help='Filter tasks by project ID')
    parser.add_argument('--task-id', help='Sync a single task by ID')

    args = parser.parse_args()

    return sync_tasks(project_id=args.project_id, task_id=args.task_id)

if __name__ == '__main__':
    sys.exit(main())
