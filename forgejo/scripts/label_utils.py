#!/usr/bin/env python3
"""Shared utilities for managing Forgejo labels."""

import requests

# Valid status and priority values
VALID_STATUSES = ["backlog", "in-progress", "done", "canceled"]
VALID_PRIORITIES = ["low", "medium", "high"]

# Label color scheme
LABEL_COLORS = {
    "status:backlog": "#d4c5f9",
    "status:in-progress": "#fbca04",
    "status:done": "#0e8a16",
    "status:canceled": "#d93f0b",
    "priority:low": "#0075ca",
    "priority:medium": "#a2eeef",
    "priority:high": "#d73a4a"
}


def ensure_labels_exist(base_url, headers, repo_name, required_labels):
    """Ensure required labels exist in the repository, creating them if necessary.

    Args:
        base_url: Forgejo base URL (e.g., "https://forgejo.example.com")
        headers: Request headers with authorization
        repo_name: Repository in "owner/repo" format
        required_labels: List of label names to ensure exist

    Returns:
        dict: Mapping of label names to their IDs
    """
    label_map = {}

    try:
        # Get existing labels
        api_url = f"{base_url}/api/v1/repos/{repo_name}/labels"
        response = requests.get(api_url, headers=headers)
        response.raise_for_status()
        existing_labels = response.json()

        # Build name -> ID mapping for existing labels
        for label in existing_labels:
            label_map[label['name']] = label['id']

        # Create missing labels
        for label_name in required_labels:
            if label_name not in label_map:
                color = LABEL_COLORS.get(label_name, "#ededed")
                description = f"Auto-created label for {label_name}"

                create_payload = {
                    "name": label_name,
                    "color": color.lstrip('#'),
                    "description": description
                }

                create_response = requests.post(api_url, headers=headers, json=create_payload)
                create_response.raise_for_status()
                new_label = create_response.json()
                label_map[label_name] = new_label['id']
    except requests.exceptions.RequestException as e:
        error_msg = str(e)
        if hasattr(e, 'response') and e.response is not None:
            error_msg = f"{error_msg}: {e.response.text}"
        # Don't fail if label creation fails - return what we have
        pass
    except Exception:
        # Don't fail if label creation fails - return what we have
        pass

    return label_map


def get_label_ids(base_url, headers, repo_name, label_names):
    """Get label IDs from label names.

    Args:
        base_url: Forgejo base URL (e.g., "https://forgejo.example.com")
        headers: Request headers with authorization
        repo_name: Repository in "owner/repo" format
        label_names: List of label names to get IDs for

    Returns:
        list: List of label IDs
    """
    if not label_names:
        return []

    try:
        api_url = f"{base_url}/api/v1/repos/{repo_name}/labels"
        response = requests.get(api_url, headers=headers)
        response.raise_for_status()
        all_labels = response.json()

        # Build name -> ID mapping
        label_map = {label['name']: label['id'] for label in all_labels}

        # Convert names to IDs
        label_ids = []
        for name in label_names:
            if name in label_map:
                label_ids.append(label_map[name])

        return label_ids
    except Exception:
        return []
