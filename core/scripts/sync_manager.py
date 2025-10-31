#!/usr/bin/env python3
"""
Shared sync metadata management for todu.

Provides utilities to read and update the unified sync.json file
that tracks sync state across all systems (GitHub, Forgejo, Todoist).
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional


# Unified sync file location
SYNC_FILE = Path.home() / ".local" / "todu" / "sync.json"


def read_sync_metadata() -> Dict[str, Any]:
    """
    Read the unified sync metadata file.

    Returns:
        Dictionary with sync metadata for all systems.
        Returns empty dict if file doesn't exist.
    """
    if not SYNC_FILE.exists():
        return {}

    try:
        with open(SYNC_FILE, 'r') as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return {}


def update_sync_metadata(
    system: str,
    mode: str,
    task_count: int,
    stats: Optional[Dict[str, int]] = None,
    project_id: Optional[str] = None
) -> None:
    """
    Update sync metadata for a specific system.

    Args:
        system: System name ('github', 'forgejo', or 'todoist')
        mode: Sync mode ('full', 'incremental', or 'single')
        task_count: Total number of tasks/issues synced
        stats: Optional detailed stats dict with 'new', 'updated', 'total' keys
        project_id: Optional project ID (for Todoist project-specific syncs)
    """
    # Read existing metadata
    metadata = read_sync_metadata()

    # Create system-specific metadata
    system_data = {
        "lastSync": datetime.now(timezone.utc).isoformat(),
        "mode": mode,
        "taskCount": task_count
    }

    # Add optional fields
    if stats:
        system_data["stats"] = stats
    if project_id:
        system_data["projectId"] = project_id

    # Update the specific system's data
    metadata[system] = system_data

    # Ensure parent directory exists
    SYNC_FILE.parent.mkdir(parents=True, exist_ok=True)

    # Write back to file
    with open(SYNC_FILE, 'w') as f:
        json.dump(metadata, f, indent=2)


def get_system_sync_metadata(system: str) -> Optional[Dict[str, Any]]:
    """
    Get sync metadata for a specific system.

    Args:
        system: System name ('github', 'forgejo', or 'todoist')

    Returns:
        System's sync metadata dict, or None if not found
    """
    metadata = read_sync_metadata()
    return metadata.get(system)
