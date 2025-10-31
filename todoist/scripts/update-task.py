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
from pathlib import Path
from todoist_api_python.api import TodoistAPI

# Valid status and priority values
VALID_STATUSES = ["backlog", "in-progress", "done", "canceled"]
VALID_PRIORITIES = ["low", "medium", "high"]

# Priority mapping
LABEL_TO_PRIORITY = {
    "priority:high": 4,
    "priority:medium": 3,
    "priority:low": 2
}

PRIORITY_TO_LABEL = {
    4: "priority:high",
    3: "priority:medium",
    2: "priority:low",
    1: None
}

def update_task(task_id, status=None, priority=None, complete=False, close=False, cancel=False, content=None, description=None):
    """Update a Todoist task's status, priority, completion state, content, or description."""
    token = os.environ.get('TODOIST_TOKEN')
    if not token:
        print(json.dumps({"error": "TODOIST_TOKEN environment variable not set"}), file=sys.stderr)
        sys.exit(1)

    try:
        api = TodoistAPI(token)

        # Fetch current task
        task = api.get_task(task_id)

        # Handle completion states
        if cancel:
            status = "canceled"
            close = True

        if close and not status:
            status = "done"

        # Map status to completion
        should_complete = False
        if status in ["done", "canceled"] or complete:
            should_complete = True

        # Prepare update parameters
        update_params = {}

        # Update content (title) if provided
        if content is not None:
            update_params['content'] = content

        # Update description if provided
        if description is not None:
            update_params['description'] = description

        # Update priority if requested
        if priority:
            if priority not in VALID_PRIORITIES:
                print(json.dumps({"error": f"Invalid priority '{priority}'. Valid values: {', '.join(VALID_PRIORITIES)}"}), file=sys.stderr)
                return 1

            todoist_priority = LABEL_TO_PRIORITY.get(f"priority:{priority}", 1)
            update_params['priority'] = todoist_priority

        # Apply updates if any
        if update_params:
            api.update_task(task_id=task_id, **update_params)

        # Add status label if provided (do this BEFORE completing the task)
        task_labels = list(task.labels) if task.labels else []
        labels_to_update = None

        if status:
            if status not in VALID_STATUSES:
                print(json.dumps({"error": f"Invalid status '{status}'. Valid values: {', '.join(VALID_STATUSES)}"}), file=sys.stderr)
                return 1
            # Add status as a label (since Todoist doesn't have status concept)
            status_label = f"status:{status}"
            if status_label not in task_labels:
                task_labels.append(status_label)
                labels_to_update = task_labels

        # Update labels in Todoist if needed
        if labels_to_update is not None:
            api.update_task(task_id=task_id, labels=labels_to_update)

        # Handle task completion (after labels are set)
        if should_complete and not task.is_completed:
            api.complete_task(task_id=task_id)
        elif not should_complete and task.is_completed:
            api.uncomplete_task(task_id=task_id)

        # Refresh task to get updated state
        task = api.get_task(task_id)

        # Convert Todoist priority to label for display
        priority_label = PRIORITY_TO_LABEL.get(task.priority)
        display_labels = list(task.labels) if task.labels else []
        if priority_label and priority_label not in display_labels:
            display_labels.append(priority_label)

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
        normalized_status = "open"
        if task.is_completed:
            # Check for status labels to determine the actual status
            if "status:canceled" in display_labels:
                normalized_status = "canceled"
            elif "status:done" in display_labels:
                normalized_status = "done"
            else:
                # Completed but no status label, default to done
                normalized_status = "done"
        else:
            # Not completed, check for in-progress or backlog
            if "status:in-progress" in display_labels:
                normalized_status = "in-progress"
            elif "status:backlog" in display_labels:
                normalized_status = "backlog"

        # Return normalized format
        result = {
            "id": task.id,
            "system": "todoist",
            "type": "task",
            "title": task.content,
            "description": task.description or "",
            "status": normalized_status,
            "url": task.url,
            "createdAt": created_at,
            "updatedAt": updated_at,
            "labels": display_labels,
            "assignees": [],
            "systemData": {
                "project_id": task.project_id,
                "priority": task.priority,
                "due": due_date,
                "is_completed": task.is_completed
            }
        }

        # Trigger background sync of the updated task
        try:
            plugin_dir = os.environ.get('PLUGIN_DIR', Path(__file__).parent.parent)
            sync_script = Path(plugin_dir) / "scripts" / "sync-tasks.py"

            subprocess.Popen(
                [str(sync_script), "--task-id", task_id],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                env=os.environ.copy()
            )
        except Exception as e:
            # Don't fail update if sync fails
            print(f"Warning: Failed to trigger sync: {e}", file=sys.stderr)

        print(json.dumps(result, indent=2))
        return 0

    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        return 1

def main():
    parser = argparse.ArgumentParser(description='Update a Todoist task status, priority, state, content, or description')
    parser.add_argument('--task-id', required=True, help='Task ID to update')
    parser.add_argument('--status', choices=VALID_STATUSES, help='Set task status')
    parser.add_argument('--priority', choices=VALID_PRIORITIES, help='Set task priority')
    parser.add_argument('--complete', action='store_true', help='Mark task as completed')
    parser.add_argument('--close', action='store_true', help='Close task (marks as done)')
    parser.add_argument('--cancel', action='store_true', help='Cancel task (sets status:canceled and closes)')
    parser.add_argument('--content', help='Update task content/title')
    parser.add_argument('--description', help='Update task description')

    args = parser.parse_args()

    # Validate that at least one update is requested
    if not any([args.status, args.priority, args.complete, args.close, args.cancel, args.content, args.description]):
        parser.error("Must specify at least one of: --status, --priority, --complete, --close, --cancel, --content, or --description")

    # Validate --close and --cancel are mutually exclusive
    if args.close and args.cancel:
        parser.error("Cannot specify both --close and --cancel")

    return update_task(args.task_id, args.status, args.priority, args.complete, args.close, args.cancel, args.content, args.description)

if __name__ == '__main__':
    sys.exit(main())
