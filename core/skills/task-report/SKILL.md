---
name: core-task-report
description: MANDATORY skill for generating markdown reports from tasks across all systems (GitHub, Forgejo, Todoist). NEVER call scripts/report.py directly - ALWAYS use this skill via the Skill tool. Use when user wants to generate daily or weekly task reports. (plugin:core@todu)
---

# Generate Task Reports

**⚠️ MANDATORY: ALWAYS invoke this skill via the Skill tool for EVERY report request.**

**NEVER EVER call `report.py` directly. This skill provides essential logic beyond just running the script:**

- Parsing report type from user query (daily vs weekly)
- Determining output file path from natural language
- Validating cache freshness across all systems
- Prompting for clarification when report parameters are ambiguous
- Handling errors gracefully with helpful messages
- Suggesting sync if cache is stale

Even if you've invoked this skill before in the conversation, you MUST invoke it again for each new report request.

---

This skill generates markdown reports by aggregating locally cached tasks from GitHub, Forgejo, and Todoist.

## When to Use

- User explicitly requests a "daily report" or "weekly report"
- User asks for task summaries or status reports
- User wants to export tasks to markdown format
- User mentions generating reports across all systems

## What This Skill Does

1. **Parse Request**
   - Determine report type (daily or weekly)
   - Extract output file path if specified
   - Parse date/week specification for weekly reports
   - Prompt for clarification if needed

2. **Validate Cache**
   - Check last sync times for all systems
   - Warn if cache is stale (> 24 hours)
   - Suggest running sync before generating report

3. **Generate Report**
   - Call `$PROJECT_ROOT/scripts/report.py` with appropriate flags
   - Aggregate data from all three systems
   - Apply timezone conversion for local dates
   - Format results as markdown tables

4. **Handle Output**
   - Save to specified file path if provided
   - Display report to user
   - Confirm file location

## Report Types

### Daily Report

Lists tasks that need attention today:

- **In Progress**: Tasks with status `in-progress` or `open` with assignees
- **Due/Overdue**: Todoist tasks with due dates <= today
- **High Priority**: Tasks with `priority:high` label or Todoist priority >= 3

### Weekly Report

Summarizes completed work for the calendar week (Monday-Sunday):

- **Completed This Week**: Tasks marked `done`/`closed` during the week
- **Cancelled This Week**: Tasks marked `canceled` during the week
- **Statistics**: Completion count, cancellation count, completion rate

## Example Interactions

**User**: "Generate a daily report"
**Skill**:

```text
Checking cache freshness...
✓ GitHub: synced 2 hours ago
✓ Forgejo: synced 3 hours ago
✓ Todoist: synced 1 hour ago

Generating daily report...

# Daily Task Report - 2025-10-29

## Summary
- **In Progress**: 5 tasks
- **Due/Overdue**: 3 tasks
- **High Priority**: 7 tasks

[... rest of report ...]
```

**User**: "Create a weekly report and save to ~/Documents/weekly.md"
**Skill**:

- Parses: type=weekly, output=~/Documents/weekly.md
- Generates report for current week (Monday-Sunday)
- Saves to file
- Confirms: "Report saved to: /Users/erik/Documents/weekly.md"

**User**: "Generate weekly report for last week"
**Skill**:

- Calculates last week's Monday-Sunday range
- Generates report with `--week` flag
- Displays results

## Script Interface

```bash
# Daily report to stdout
$PROJECT_ROOT/scripts/report.py --type daily

# Daily report to file
$PROJECT_ROOT/scripts/report.py --type daily --output ~/daily.md

# Weekly report for current week
$PROJECT_ROOT/scripts/report.py --type weekly

# Weekly report for specific week
$PROJECT_ROOT/scripts/report.py --type weekly --week 2025-10-21 --output ~/weekly.md
```

## Example Output Formats

### Daily Report

```markdown
# Daily Task Report - 2025-10-29

## Summary
- **In Progress**: 5 tasks
- **Due/Overdue**: 3 tasks
- **High Priority**: 7 tasks

## 🚧 In Progress (5)
| System   | Title                                      | Priority | Assignee | Due Date   |
|----------|--------------------------------------------|----------|----------|------------|
| todoist  | Implement reporting feature                | high     | erik     | 2025-10-29 |
| github   | Fix authentication bug #123                | medium   | alice    | -          |

## ⚠️  Overdue (2)
| System   | Title                                      | Priority | Days Late | Assignee |
|----------|--------------------------------------------|-----------|-----------|-----------—|
| todoist  | Review PR from last week                   | high     | 5         | erik     |

## 📅 Due Today (1)
| System   | Title                                      | Priority | Assignee |
|----------|--------------------------------------------|----------|----------|
| todoist  | Submit budget report                       | medium   | erik     |

## 🔥 High Priority (7)
| System   | Title                                      | Assignee | Due Date   |
|----------|--------------------------------------------|----------|------------|
| github   | Security vulnerability #456                | bob      | -          |
| forgejo  | Production deployment                      | alice    | -          |
```

### Weekly Report

```markdown
# Weekly Task Report - Week of 2025-10-21

## Summary
- **Completed**: 15 tasks
- **Cancelled**: 2 tasks
- **Completion Rate**: 88% (15 of 17 closed)

## ✅ Completed This Week (15)
| System   | Title                                      | Completed  | Assignee | Labels              |
|----------|--------------------------------------------|-----------|-----------|--------------------|
| todoist  | Write documentation                        | 2025-10-23 | erik     | docs, p:high        |
| github   | Implement user authentication #789         | 2025-10-24 | alice    | enhancement         |

## ❌ Cancelled This Week (2)
| System   | Title                                      | Cancelled  | Assignee | Labels              |
|----------|--------------------------------------------|-----------|-----------|--------------------|
| forgejo  | Outdated feature request                   | 2025-10-25 | -        | wontfix             |
```

## Technical Details

### Timezone Handling

- All timestamps stored in UTC with 'Z' suffix
- Reports use user's system timezone for date calculations
- "Today", "this week", "overdue" calculated in local time
- Report headers show dates in local timezone

### Priority Mapping

- Labels `priority:high/medium/low` recognized across all systems
- Todoist priority: 4=high, 3=medium, 2=low, 1=none
- Tasks without priority labels shown as "none"

### Due Date Handling

- Only Todoist has explicit due dates
- GitHub/Forgejo show "-" for due date (don't parse from labels)
- Due date comparison uses local timezone dates

### Cache Location

- GitHub: `~/.local/todu/github/issues/*.json`
- Forgejo: `~/.local/todu/forgejo/issues/*.json`
- Todoist: `~/.local/todu/todoist/tasks/*.json`

## Notes

- Reports are generated from local cache (no API calls)
- Suggest syncing if cache is > 24 hours old
- Weekly reports use calendar weeks (Monday-Sunday)
- Empty sections are omitted from output
- All date/time calculations use user's system timezone
