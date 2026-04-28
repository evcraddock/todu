# Phase 5: Sync Worker + Background Jobs

> Post-MVP - Background job system and automatic recurring task processing

## Overview

Implement the sync worker infrastructure that handles background operations. This enables automatic recurring task processing and prepares the foundation for external sync plugins.

## Goals

- Unified background job system
- Automatic recurring task processing
- Foundation for external sync (Phase 6)
- Works in Electron (embedded) and standalone (server)

## Scope

### Deliverables

1. **Background Job System** (@todu/core)
   - Job interface (periodic, scheduled, event types)
   - Job scheduler
   - Job execution context

2. **packages/worker**
   - Standalone sync worker binary
   - Connects to Automerge sync server
   - Runs registered background jobs
   - Can run headless on servers

3. **Electron Integration**
   - Worker embedded in Electron
   - Runs while app is in tray
   - Status in UI

4. **Recurring Task Processing Job**
   - Periodic job that processes due templates
   - Deterministic task IDs to prevent duplicates
   - Runs automatically when worker is active

## Requirements

### Background Job Interface

```typescript
interface BackgroundJob {
  name: string;
  type: "periodic" | "scheduled" | "event";
  interval?: string; // "5m", "10m", "1h"
  schedule?: string; // cron expression (future)
  trigger?: string; // event name (future)
  run(context: JobContext): Promise<void>;
}
```

### Worker Capabilities

- Connect to Automerge sync server
- Watch for document changes
- Run jobs on schedule
- Report status
- Handle graceful shutdown

### Functional

- Recurring templates process automatically
- Only one worker processes at a time (coordination)
- Works when Electron running or standalone

### Technical

- TypeScript
- Can run as Docker container
- Minimal dependencies for standalone mode

## Dependencies

- MVP complete (Phase 1-3)
- Recurring Template CRUD (#1583)

## Success Criteria

1. Recurring tasks created automatically when due
2. No duplicate tasks on multi-device
3. Worker runs reliably in background
4. Electron handles jobs when running

## Implementation Notes

### Deterministic Task IDs

To prevent duplicate tasks on multi-device:

```typescript
function generateRecurringTaskId(templateId: string, scheduledDate: Date): string {
  return `recurring-${templateId}-${scheduledDate.toISOString().split("T")[0]}`;
}
```

### Worker Coordination

- On multi-device, only worker should process recurring tasks
- If no worker, devices should not auto-process (use manual `todu recurring process`)
- Worker claims ownership via Automerge document flag

## Open Questions

- How does worker discover sync server URL?
- Should Electron always run worker, or only when configured?
- How to deploy worker for hosted service?
