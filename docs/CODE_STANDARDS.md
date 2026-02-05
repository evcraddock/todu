# Code Standards

## TypeScript

### Strict Mode
All packages use TypeScript strict mode. No `any` types without explicit justification.

### Types vs Interfaces
Prefer `type` for data shapes:
```typescript
type Task = {
  id: TaskId;
  title: string;
  status: TaskStatus;
};
```

Use `interface` for contracts that may be extended:
```typescript
interface Repository<T> {
  get(id: string): Promise<T | null>;
  save(item: T): Promise<void>;
}
```

### Branded Types
Use branded types for IDs to prevent mixing:
```typescript
type TaskId = string & { readonly __brand: 'TaskId' };
type ProjectId = string & { readonly __brand: 'ProjectId' };
```

### Explicit Return Types
Public functions must have explicit return types:
```typescript
// Good
export function createTask(title: string): Task { ... }

// Bad
export function createTask(title: string) { ... }
```

## Error Handling

### Result Types
Use Result types for operations that can fail:
```typescript
type Result<T, E = Error> = 
  | { ok: true; value: T }
  | { ok: false; error: E };
```

### Error Context
Always include context in errors:
```typescript
// Good
throw new Error(`Failed to load task ${taskId}: ${cause.message}`);

// Bad
throw new Error('Load failed');
```

## Automerge

### Document Structure
Each Automerge document type has a schema in `packages/core/src/schema/`.

### Immutable Updates
Use Automerge's `change` function for updates:
```typescript
import { change } from '@automerge/automerge';

const updated = change(doc, 'Update task title', (d) => {
  d.title = newTitle;
});
```

### Sync
Never assume network availability. Design for offline-first:
```typescript
// Good: Local operation, sync happens in background
await localRepo.save(task);
syncService.scheduleSync(); // Non-blocking

// Bad: Requires network
await remoteApi.saveTask(task);
```

## File Organization

```
packages/core/src/
├── schema/       # Automerge document schemas
├── operations/   # Business logic
├── sync/         # Sync-related code
└── types/        # Shared types
```

## Testing

### Unit Tests
Test pure functions and business logic:
```typescript
describe('createTask', () => {
  it('creates a task with the given title', () => {
    const task = createTask('My task');
    expect(task.title).toBe('My task');
  });
});
```

### Integration Tests
Test CLI commands end-to-end:
```typescript
describe('todu task create', () => {
  it('creates a task and outputs the ID', async () => {
    const result = await runCli(['task', 'create', 'My task']);
    expect(result.stdout).toContain('Created task');
  });
});
```
