# Phase 7: Polish

> Post-MVP - Migration tooling, advanced job types, and refinements

## Overview

Final polish phase covering migration from old system, advanced background job types, and general improvements.

## Goals

- Smooth migration path from todu-api
- Advanced job scheduling capabilities
- Production hardening
- Documentation completion

## Scope

### Deliverables

1. **Migration Tooling**
   - Export from todu-api (JSON format)
   - `todu migrate import ./export.json`
   - Map old IDs to new IDs
   - Preserve history and comments
   - Validate imported data

2. **Scheduled Jobs**
   - Cron-style job scheduling
   - Run jobs at specific times
   - Examples: daily digest, weekly review

3. **Event-Driven Jobs**
   - React to document changes
   - Trigger on task due, status change, etc.
   - Foundation for notifications

4. **Production Hardening**
   - Error handling improvements
   - Logging and diagnostics
   - Performance optimization
   - Memory management for long-running worker

5. **Documentation**
   - User guide
   - Plugin development guide
   - Self-hosting guide
   - API reference for @todu/core

## Requirements

### Migration
```bash
# Export from old system
curl https://api.todu.example.com/export > export.json

# Import to new system
todu migrate import ./export.json --dry-run
todu migrate import ./export.json

# Verify
todu migrate verify
```

### Migration Mapping
| Old (todu-api) | New (Automerge) |
|----------------|-----------------|
| Task | Task |
| Project | Project |
| Label | Label |
| Comment | Comment |
| RecurringTaskTemplate | RecurringTemplate |
| external_id | externalId |
| source_url | sourceUrl |

### Scheduled Jobs
```typescript
interface BackgroundJob {
  type: 'scheduled';
  schedule: string;  // cron expression
  // ...
}

// Example: Daily digest at 9am
{
  name: 'daily-digest',
  type: 'scheduled',
  schedule: '0 9 * * *',
  run: async (ctx) => {
    // Generate and send digest
  }
}
```

### Event-Driven Jobs
```typescript
interface BackgroundJob {
  type: 'event';
  trigger: string;  // event name
  // ...
}

// Example: Notify on task due
{
  name: 'task-due-notification',
  type: 'event',
  trigger: 'task:due',
  run: async (ctx, event) => {
    // Send notification
  }
}
```

## Dependencies

- All previous phases complete
- Running todu-api for migration testing

## Success Criteria

1. Can migrate from todu-api without data loss
2. Scheduled jobs run at correct times
3. Event-driven jobs trigger on document changes
4. Documentation enables self-service

## Future Considerations (Beyond Phase 7)

- Mobile apps (React Native)
- Team features (shared projects, assignments)
- Additional plugins (Linear, Jira, etc.)
- Habit tracking
- Time tracking
- Calendar integration
- Notifications (push, email)

## Open Questions

- How long to maintain todu-api after migration?
- Should migration be reversible?
- What events should be supported initially?
- How to handle notification delivery (push service)?
