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

def list_projects(output_format='json'):
    """List all Todoist projects."""
    token = os.environ.get('TODOIST_TOKEN')
    if not token:
        print(json.dumps({"error": "TODOIST_TOKEN environment variable not set"}), file=sys.stderr)
        sys.exit(1)

    try:
        api = TodoistAPI(token)
        projects_paginator = api.get_projects()

        # Convert paginator to list and flatten (paginator returns nested list)
        projects = []
        for page in projects_paginator:
            if isinstance(page, list):
                projects.extend(page)
            else:
                projects.append(page)

        # Convert to our format
        project_list = []
        for project in projects:
            # Handle both object and dict responses
            if hasattr(project, 'id'):
                project_id = project.id
                project_name = project.name
                project_color = project.color
                is_favorite = project.is_favorite
                is_inbox = project.is_inbox_project if hasattr(project, 'is_inbox_project') else False
                view_style = project.view_style if hasattr(project, 'view_style') else None
            else:
                project_id = project.get('id')
                project_name = project.get('name')
                project_color = project.get('color')
                is_favorite = project.get('is_favorite', False)
                is_inbox = project.get('is_inbox_project', False)
                view_style = project.get('view_style')

            project_list.append({
                "id": project_id,
                "name": project_name,
                "color": project_color,
                "is_favorite": is_favorite,
                "is_inbox": is_inbox,
                "view_style": view_style
            })

        if output_format == 'json':
            print(json.dumps({"projects": project_list}, indent=2))
        elif output_format == 'markdown':
            print(f"Found {len(project_list)} Todoist project(s):\n")
            for project in project_list:
                inbox_marker = " [INBOX]" if project.get('is_inbox') else ""
                fav_marker = " ⭐" if project.get('is_favorite') else ""
                print(f"- **{project['name']}**{inbox_marker}{fav_marker}")
                print(f"  ID: `{project['id']}`")
                print(f"  Color: {project['color']}")
                print()

        return 0

    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        return 1

def main():
    parser = argparse.ArgumentParser(description='List all Todoist projects')
    parser.add_argument('--format', choices=['json', 'markdown'], default='json',
                       help='Output format')

    args = parser.parse_args()
    return list_projects(output_format=args.format)

if __name__ == '__main__':
    sys.exit(main())
