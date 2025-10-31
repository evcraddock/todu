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

CACHE_DIR = Path.home() / ".local" / "todu"

def load_items_from_consolidated():
    """Load items from new consolidated structure: ~/.local/todu/items/"""
    items_dir = CACHE_DIR / "items"
    items = []

    if items_dir.exists():
        for item_file in items_dir.glob("*.json"):
            try:
                with open(item_file) as f:
                    item = json.load(f)
                    items.append(item)
            except Exception as e:
                print(f"Warning: Failed to load {item_file}: {e}", file=sys.stderr)
                continue

    return items

def load_items_from_legacy():
    """Load items from legacy structure: ~/.local/todu/{system}/issues|tasks/"""
    items = []

    # Check for plugin directories
    for system_dir in CACHE_DIR.iterdir():
        if not system_dir.is_dir() or system_dir.name == 'items':
            continue

        # Check both issues/ and tasks/ subdirectories
        for subdir_name in ['issues', 'tasks']:
            subdir = system_dir / subdir_name
            if subdir.exists():
                for item_file in subdir.glob("*.json"):
                    try:
                        with open(item_file) as f:
                            item = json.load(f)
                            items.append(item)
                    except Exception as e:
                        print(f"Warning: Failed to load {item_file}: {e}", file=sys.stderr)
                        continue

    return items

def list_items(system=None, status=None, assignee=None, labels=None, project_id=None, output_format='json'):
    """List items from local cache with optional filtering."""

    # Try consolidated structure first, fall back to legacy
    items = load_items_from_consolidated()
    if not items:
        items = load_items_from_legacy()

    if not items:
        print(json.dumps({"error": "No cached items found. Run sync first."}), file=sys.stderr)
        return 1

    # Apply filters
    if system:
        items = [i for i in items if i.get('system') == system]

    if status:
        items = [i for i in items if i.get('status') == status]

    if assignee:
        items = [i for i in items if assignee in i.get('assignees', [])]

    if labels:
        label_list = labels.split(',')
        items = [i for i in items if any(l in i.get('labels', []) for l in label_list)]

    if project_id:
        items = [i for i in items if i.get('systemData', {}).get('project_id') == project_id]

    # Sort by updated date (newest first), with fallback to created date
    items.sort(key=lambda x: x.get('updatedAt') or x.get('createdAt', ''), reverse=True)

    # Format output
    if output_format == 'json':
        print(json.dumps(items, indent=2))
    elif output_format == 'markdown':
        print(f"Found {len(items)} item(s):\n")
        for item in items:
            system_name = item.get('system', 'unknown')
            labels_str = ", ".join(item.get('labels', []))
            item_id = item.get('id', 'unknown')

            # Show system prefix
            print(f"[{system_name.upper()}] #{item_id}: {item['title']}")
            if labels_str:
                print(f"  Labels: {labels_str}")
            print(f"  Status: {item['status']}")

            # Show due date if present
            due_date = item.get('systemData', {}).get('due')
            if due_date:
                print(f"  Due: {due_date}")

            print(f"  URL: {item['url']}\n")

    return 0

def main():
    parser = argparse.ArgumentParser(description='List items from local cache across all systems')
    parser.add_argument('--system', choices=['github', 'forgejo', 'todoist'], help='Filter by system')
    parser.add_argument('--status', choices=['open', 'closed'], help='Filter by status')
    parser.add_argument('--assignee', help='Filter by assignee username')
    parser.add_argument('--labels', help='Comma-separated list of labels to filter by')
    parser.add_argument('--project-id', help='Filter by project ID (Todoist)')
    parser.add_argument('--format', choices=['json', 'markdown'], default='json', help='Output format')

    args = parser.parse_args()

    return list_items(
        system=args.system,
        status=args.status,
        assignee=args.assignee,
        labels=args.labels,
        project_id=args.project_id,
        output_format=args.format
    )

if __name__ == '__main__':
    sys.exit(main())
