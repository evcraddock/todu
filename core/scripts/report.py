#!/usr/bin/env -S uv run
# /// script
# dependencies = []
# requires-python = ">=3.9"
# ///

import argparse
import importlib.util
import json
import sys
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any

# Import cache loading functions from list-items.py
_list_items_path = Path(__file__).parent / "list-items.py"
_spec = importlib.util.spec_from_file_location("list_items", _list_items_path)
_list_items = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_list_items)

load_items_from_consolidated = _list_items.load_items_from_consolidated
load_items_from_legacy = _list_items.load_items_from_legacy


def load_all_tasks() -> List[Dict[str, Any]]:
    """Load all tasks/issues from consolidated cache with legacy fallback."""
    # Try consolidated structure first, fall back to legacy
    tasks = load_items_from_consolidated()
    if not tasks:
        tasks = load_items_from_legacy()
    return tasks


def parse_priority(task: Dict[str, Any]) -> str:
    """Extract priority level from task."""
    # Use standardized priority field (set by plugin during sync)
    priority = task.get("priority")
    if priority in ["high", "medium", "low"]:
        return priority

    # Fallback: check labels for priority:high/medium/low
    labels = task.get("labels", [])
    for label in labels:
        if label.startswith("priority:"):
            return label.split(":", 1)[1]

    return "none"


def parse_due_date(task: Dict[str, Any]) -> datetime | None:
    """Extract due date from task."""
    # Use standardized dueDate field (set by plugin during sync)
    due_date_str = task.get("dueDate")
    if not due_date_str:
        return None

    try:
        # Parse ISO date string
        return datetime.fromisoformat(due_date_str.replace('Z', '+00:00'))
    except:
        return None


def to_local_date(dt: datetime, user_tz) -> datetime:
    """Convert datetime to user's local timezone."""
    if dt.tzinfo is None:
        # Assume UTC if no timezone info
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(user_tz)


def format_date(dt: datetime | None) -> str:
    """Format date for display."""
    if dt is None:
        return "-"
    return dt.strftime("%Y-%m-%d")


def get_week_range(date: datetime) -> tuple[datetime, datetime]:
    """Get Monday-Sunday range for the week containing date."""
    # Get Monday of the week
    monday = date - timedelta(days=date.weekday())
    monday = monday.replace(hour=0, minute=0, second=0, microsecond=0)

    # Get Sunday of the week
    sunday = monday + timedelta(days=6, hours=23, minutes=59, seconds=59)

    return monday, sunday


def generate_daily_report(tasks: List[Dict[str, Any]], user_tz) -> str:
    """Generate daily task report."""
    now = datetime.now(user_tz)
    today = now.date()

    # Filter tasks by categories
    in_progress = []
    due_today = []
    overdue = []
    high_priority = []
    completed_today = []
    canceled_today = []

    for task in tasks:
        status = task.get("status", "")
        priority = parse_priority(task)

        # In Progress: status in-progress or open with assignees
        if status in ["in-progress", "open"]:
            if status == "in-progress" or task.get("assignees"):
                in_progress.append(task)

        # Due/Overdue: Any tasks with due dates
        due_date = parse_due_date(task)
        if due_date and status not in ["done", "closed", "canceled"]:
            due_local = to_local_date(due_date, user_tz).date()
            if due_local < today:
                overdue.append((task, (today - due_local).days))
            elif due_local == today:
                due_today.append(task)

        # High Priority: Tasks with priority field = "high"
        if priority == "high" and status not in ["done", "closed", "canceled"]:
            high_priority.append(task)

        # Completed Today: Tasks completed (NOT canceled) today
        if status in ["done", "closed"] and status != "canceled":
            completed_at_str = task.get("completedAt")
            if completed_at_str:
                try:
                    completed_at = datetime.fromisoformat(completed_at_str.replace('Z', '+00:00'))
                    completed_at_local = to_local_date(completed_at, user_tz).date()
                    if completed_at_local == today:
                        completed_today.append(task)
                except:
                    pass

        # Canceled Today: Tasks canceled today (use updatedAt)
        if status == "canceled":
            updated_at_str = task.get("updatedAt")
            if updated_at_str:
                try:
                    updated_at = datetime.fromisoformat(updated_at_str.replace('Z', '+00:00'))
                    updated_at_local = to_local_date(updated_at, user_tz).date()
                    if updated_at_local == today:
                        canceled_today.append(task)
                except:
                    pass

    # Generate markdown report
    lines = [
        f"# Daily Task Report - {today.strftime('%Y-%m-%d')}",
        "",
        "## Summary",
        f"- **In Progress**: {len(in_progress)} tasks",
        f"- **Due/Overdue**: {len(overdue) + len(due_today)} tasks",
        f"- **High Priority**: {len(high_priority)} tasks",
        f"- **Completed Today**: {len(completed_today)} tasks",
        f"- **Canceled Today**: {len(canceled_today)} tasks",
        ""
    ]

    # In Progress section
    if in_progress:
        lines.append("## 🚧 In Progress ({})".format(len(in_progress)))
        lines.append("")
        for task in in_progress:
            system = task.get("system", "")
            title = task.get("title", "")
            priority = parse_priority(task)
            assignees = ", ".join(task.get("assignees", []))
            due = format_date(parse_due_date(task))
            url = task.get("url", "")

            lines.append(f"**{title}**")
            meta = [f"System: {system}"]
            if priority != "none":
                meta.append(f"Priority: {priority}")
            if assignees:
                meta.append(f"Assignee: {assignees}")
            if due != "-":
                meta.append(f"Due: {due}")
            lines.append(f"  {' • '.join(meta)}")
            lines.append(f"  {url}")
            lines.append("")

    # Overdue section
    if overdue:
        lines.append("## ⚠️  Overdue ({})".format(len(overdue)))
        lines.append("")
        for task, days_late in overdue:
            system = task.get("system", "")
            title = task.get("title", "")
            priority = parse_priority(task)
            assignees = ", ".join(task.get("assignees", []))
            url = task.get("url", "")

            lines.append(f"**{title}** ({days_late} days late)")
            meta = [f"System: {system}"]
            if priority != "none":
                meta.append(f"Priority: {priority}")
            if assignees:
                meta.append(f"Assignee: {assignees}")
            lines.append(f"  {' • '.join(meta)}")
            lines.append(f"  {url}")
            lines.append("")

    # Due Today section
    if due_today:
        lines.append("## 📅 Due Today ({})".format(len(due_today)))
        lines.append("")
        for task in due_today:
            system = task.get("system", "")
            title = task.get("title", "")
            priority = parse_priority(task)
            assignees = ", ".join(task.get("assignees", []))
            url = task.get("url", "")

            lines.append(f"**{title}**")
            meta = [f"System: {system}"]
            if priority != "none":
                meta.append(f"Priority: {priority}")
            if assignees:
                meta.append(f"Assignee: {assignees}")
            lines.append(f"  {' • '.join(meta)}")
            lines.append(f"  {url}")
            lines.append("")

    # High Priority section
    if high_priority:
        lines.append("## 🔥 High Priority ({})".format(len(high_priority)))
        lines.append("")
        for task in high_priority:
            system = task.get("system", "")
            title = task.get("title", "")
            assignees = ", ".join(task.get("assignees", []))
            due = format_date(parse_due_date(task))
            url = task.get("url", "")

            lines.append(f"**{title}**")
            meta = [f"System: {system}"]
            if assignees:
                meta.append(f"Assignee: {assignees}")
            if due != "-":
                meta.append(f"Due: {due}")
            lines.append(f"  {' • '.join(meta)}")
            lines.append(f"  {url}")
            lines.append("")

    # Completed Today section
    if completed_today:
        lines.append("## ✅ Completed Today ({})".format(len(completed_today)))
        lines.append("")
        for task in completed_today:
            system = task.get("system", "")
            title = task.get("title", "")
            status = task.get("status", "")
            assignees = ", ".join(task.get("assignees", []))
            labels = [l for l in task.get("labels", []) if not l.startswith("status:")]
            url = task.get("url", "")

            lines.append(f"**{title}**")
            meta = [f"System: {system}", f"Status: {status}"]
            if assignees:
                meta.append(f"Assignee: {assignees}")
            if labels:
                meta.append(f"Labels: {', '.join(labels)}")
            lines.append(f"  {' • '.join(meta)}")
            lines.append(f"  {url}")
            lines.append("")

    # Canceled Today section
    if canceled_today:
        lines.append("## ❌ Canceled Today ({})".format(len(canceled_today)))
        lines.append("")
        for task in canceled_today:
            system = task.get("system", "")
            title = task.get("title", "")
            assignees = ", ".join(task.get("assignees", []))
            labels = [l for l in task.get("labels", []) if not l.startswith("status:")]
            url = task.get("url", "")

            lines.append(f"**{title}**")
            meta = [f"System: {system}"]
            if assignees:
                meta.append(f"Assignee: {assignees}")
            if labels:
                meta.append(f"Labels: {', '.join(labels)}")
            lines.append(f"  {' • '.join(meta)}")
            lines.append(f"  {url}")
            lines.append("")

    return "\n".join(lines)


def generate_weekly_report(tasks: List[Dict[str, Any]], user_tz, week_date: datetime | None = None) -> str:
    """Generate weekly task report."""
    if week_date is None:
        week_date = datetime.now(user_tz)

    monday, sunday = get_week_range(week_date)

    # Filter tasks completed or canceled this week
    completed = []
    canceled = []

    for task in tasks:
        status = task.get("status", "")

        # Completed tasks use completedAt
        if status in ["done", "closed"]:
            completed_at_str = task.get("completedAt")
            if completed_at_str:
                try:
                    completed_at = datetime.fromisoformat(completed_at_str.replace('Z', '+00:00'))
                    completed_at_local = to_local_date(completed_at, user_tz)
                    if monday <= completed_at_local <= sunday:
                        completed.append((task, completed_at_local))
                except:
                    continue

        # Canceled tasks use updatedAt
        elif status == "canceled":
            updated_at_str = task.get("updatedAt")
            if updated_at_str:
                try:
                    updated_at = datetime.fromisoformat(updated_at_str.replace('Z', '+00:00'))
                    updated_at_local = to_local_date(updated_at, user_tz)
                    if monday <= updated_at_local <= sunday:
                        canceled.append((task, updated_at_local))
                except:
                    continue

    # Generate markdown report
    lines = [
        f"# Weekly Task Report - Week of {monday.strftime('%Y-%m-%d')}",
        "",
        "## Summary",
        f"- **Completed**: {len(completed)} tasks",
        f"- **Cancelled**: {len(canceled)} tasks",
        ""
    ]

    # Completed section
    if completed:
        lines.append("## ✅ Completed This Week ({})".format(len(completed)))
        lines.append("")
        # Sort by completion date
        completed.sort(key=lambda x: x[1])
        for task, completed_at in completed:
            system = task.get("system", "")
            title = task.get("title", "")
            completed_date = completed_at.strftime("%Y-%m-%d")
            assignees = ", ".join(task.get("assignees", []))
            labels = [l for l in task.get("labels", []) if not l.startswith("status:")]
            url = task.get("url", "")

            lines.append(f"**{title}**")
            meta = [f"System: {system}", f"Completed: {completed_date}"]
            if assignees:
                meta.append(f"Assignee: {assignees}")
            if labels:
                meta.append(f"Labels: {', '.join(labels)}")
            lines.append(f"  {' • '.join(meta)}")
            lines.append(f"  {url}")
            lines.append("")

    # Canceled section
    if canceled:
        lines.append("## ❌ Cancelled This Week ({})".format(len(canceled)))
        lines.append("")
        # Sort by cancellation date
        canceled.sort(key=lambda x: x[1])
        for task, canceled_at in canceled:
            system = task.get("system", "")
            title = task.get("title", "")
            canceled_date = canceled_at.strftime("%Y-%m-%d")
            assignees = ", ".join(task.get("assignees", []))
            labels = [l for l in task.get("labels", []) if not l.startswith("status:")]
            url = task.get("url", "")

            lines.append(f"**{title}**")
            meta = [f"System: {system}", f"Cancelled: {canceled_date}"]
            if assignees:
                meta.append(f"Assignee: {assignees}")
            if labels:
                meta.append(f"Labels: {', '.join(labels)}")
            lines.append(f"  {' • '.join(meta)}")
            lines.append(f"  {url}")
            lines.append("")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description='Generate markdown reports from cached tasks')
    parser.add_argument('--type', choices=['daily', 'weekly'], required=True, help='Report type')
    parser.add_argument('--output', help='Output file path (default: stdout)')
    parser.add_argument('--week', help='Week date (YYYY-MM-DD) for weekly report (default: current week)')

    args = parser.parse_args()

    # Get user's local timezone
    user_tz = datetime.now().astimezone().tzinfo

    # Load all tasks
    tasks = load_all_tasks()

    if not tasks:
        print("Warning: No tasks found in cache. Run sync commands first.", file=sys.stderr)
        return 1

    # Generate report
    if args.type == 'daily':
        report = generate_daily_report(tasks, user_tz)
    else:  # weekly
        week_date = None
        if args.week:
            try:
                week_date = datetime.fromisoformat(args.week).replace(tzinfo=user_tz)
            except:
                print(f"Error: Invalid week date format: {args.week}", file=sys.stderr)
                return 1
        report = generate_weekly_report(tasks, user_tz, week_date)

    # Output report
    if args.output:
        output_path = Path(args.output).expanduser()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, 'w') as f:
            f.write(report)
        print(f"Report saved to: {output_path}")
    else:
        print(report)

    return 0


if __name__ == '__main__':
    sys.exit(main())
