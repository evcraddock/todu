#!/usr/bin/env python3
"""Shared utilities for managing GitHub labels."""

import requests

# Valid status and priority values
VALID_STATUSES = ["backlog", "in-progress", "done", "canceled"]
VALID_PRIORITIES = ["low", "medium", "high"]

# Label color scheme
LABEL_COLORS = {
    "status:backlog": "d4c5f9",
    "status:in-progress": "fbca04",
    "status:done": "0e8a16",
    "status:canceled": "d93f0b",
    "priority:low": "0075ca",
    "priority:medium": "a2eeef",
    "priority:high": "d73a4a"
}


def ensure_labels_exist(base_url, headers, repo_name, required_labels):
    """Ensure required labels exist in the repository, creating them if necessary.

    Args:
        base_url: GitHub base URL (e.g., "https://api.github.com")
        headers: Request headers with authorization
        repo_name: Repository in "owner/repo" format
        required_labels: List of label names to ensure exist

    Returns:
        dict: Mapping of label names to their names (GitHub uses names, not IDs)
    """
    label_map = {}

    try:
        # Get existing labels
        api_url = f"{base_url}/repos/{repo_name}/labels"
        response = requests.get(api_url, headers=headers)
        response.raise_for_status()
        existing_labels = response.json()

        # Build name -> name mapping for existing labels (for consistency with Forgejo)
        for label in existing_labels:
            label_map[label['name']] = label['name']

        # Create missing labels
        for label_name in required_labels:
            if label_name not in label_map:
                color = LABEL_COLORS.get(label_name, "ededed")
                description = f"Auto-created label for {label_name}"

                create_payload = {
                    "name": label_name,
                    "color": color,
                    "description": description
                }

                create_response = requests.post(api_url, headers=headers, json=create_payload)
                create_response.raise_for_status()
                label_map[label_name] = label_name
    except requests.exceptions.RequestException:
        # Don't fail if label creation fails - return what we have
        pass
    except Exception:
        # Don't fail if label creation fails - return what we have
        pass

    return label_map


def get_label_names(base_url, headers, repo_name, label_names):
    """Get label names (for consistency with Forgejo API that uses IDs).

    GitHub API uses label names directly, not IDs, so this just validates they exist.

    Args:
        base_url: GitHub base URL (e.g., "https://api.github.com")
        headers: Request headers with authorization
        repo_name: Repository in "owner/repo" format
        label_names: List of label names to validate

    Returns:
        list: List of valid label names
    """
    if not label_names:
        return []

    try:
        api_url = f"{base_url}/repos/{repo_name}/labels"
        response = requests.get(api_url, headers=headers)
        response.raise_for_status()
        all_labels = response.json()

        # Build set of existing label names
        existing = {label['name'] for label in all_labels}

        # Return only labels that exist
        return [name for name in label_names if name in existing]
    except Exception:
        return label_names  # Return input if we can't verify
