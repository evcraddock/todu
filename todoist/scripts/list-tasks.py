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

CACHE_DIR = Path.home() / ".local" / "todu" / "todoist"

def list_tasks(project_id=None, status=None, priority=None, labels=None, output_format='json'):
    """List tasks from local cache with optional filtering."""
    tasks_dir = CACHE_DIR / "tasks"

    if not tasks_dir.exists():
        print(json.dumps({"error": "No cached tasks found. Run sync first."}), file=sys.stderr)
        return 1

    # Load all cached tasks
    tasks = []
    for task_file in tasks_dir.glob("*.json"):
        try:
            with open(task_file) as f:
                task = json.load(f)
                tasks.append(task)
        except Exception as e:
            print(f"Warning: Failed to load {task_file}: {e}", file=sys.stderr)
            continue

    # Apply filters
    if project_id:
        tasks = [t for t in tasks if t.get('systemData', {}).get('project_id') == project_id]

    if status:
        tasks = [t for t in tasks if t.get('status') == status]

    if priority:
        # Priority filter looks for priority label
        priority_label = f"priority:{priority}"
        tasks = [t for t in tasks if priority_label in t.get('labels', [])]

    if labels:
        label_list = labels.split(',')
        tasks = [t for t in tasks if any(l in t.get('labels', []) for l in label_list)]

    # Sort by creation date (newest first)
    tasks.sort(key=lambda x: x.get('createdAt', ''), reverse=True)

    # Format output
    if output_format == 'json':
        print(json.dumps(tasks, indent=2))
    elif output_format == 'markdown':
        print(f"Found {len(tasks)} task(s):\n")
        for idx, task in enumerate(tasks, start=1):
            labels_str = ", ".join(task.get('labels', []))
            due_date = task.get('systemData', {}).get('due')
            due_str = f" (due: {due_date})" if due_date else ""

            print(f"{idx}. **{task['title']}**{due_str}")
            print(f"   ID: {task['id']}")
            if labels_str:
                print(f"   Labels: {labels_str}")
            print(f"   Status: {task['status']}")
            print(f"   URL: {task['url']}\n")

    return 0

def main():
    parser = argparse.ArgumentParser(description='List tasks from local cache')
    parser.add_argument('--project-id', help='Filter by project ID')
    parser.add_argument('--status', choices=['open', 'closed'], help='Filter by status')
    parser.add_argument('--priority', choices=['low', 'medium', 'high'], help='Filter by priority')
    parser.add_argument('--labels', help='Comma-separated list of labels to filter by')
    parser.add_argument('--format', choices=['json', 'markdown'], default='json', help='Output format')

    args = parser.parse_args()

    return list_tasks(
        project_id=args.project_id,
        status=args.status,
        priority=args.priority,
        labels=args.labels,
        output_format=args.format
    )

if __name__ == '__main__':
    sys.exit(main())
