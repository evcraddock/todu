# Contributing

This project uses an AI-first development process. Agents do the work, automation enforces quality, humans approve.

## Workflow

### 1. Pick Up a Task

Get assigned a task or pick from available tasks. Understand requirements before starting.

### 2. Create a Branch

```bash
git checkout main && git pull
git checkout -b feat/{task-id}-short-description
```

Branch prefixes:
- `feat/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation only
- `chore/` - Maintenance

### 3. Implement

- Follow [CODE_STANDARDS.md](CODE_STANDARDS.md)
- Write tests as you go
- Commit frequently with clear messages

Commit format:
```
<type>: <short description>

Task: #<task-id>
```

### 4. Verify Quality

Before opening a PR:

```bash
./scripts/pre-pr.sh
```

Do not open a PR if this fails.

### 5. Open PR

Push and create PR with clear description linking to the task.

### 6. Review and Merge

- CI must pass
- Address review feedback
- Squash and merge after approval

## When Stuck

After 3 failed attempts at the same problem:

1. Stop - Don't keep trying the same approach
2. Document - What was tried and why it failed
3. Ask - Request guidance or suggest alternatives
