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

- `feat/` — New features
- `fix/` — Bug fixes
- `docs/` — Documentation only
- `chore/` — Maintenance

### 3. Implement

- Follow [CODE_STANDARDS.md](CODE_STANDARDS.md) — this is the review checklist
- Follow [ARCHITECTURE.md](ARCHITECTURE.md) — package structure, where logic belongs
- Write tests as you go
- Commit frequently with clear messages

Commit format:

```
<type>: <short description>

<optional body explaining why>

Task: #<task-id>
```

### 4. Verify Quality

Before opening a PR:

```bash
make pre-pr
```

This runs formatting, linting, type checking, and tests. Do not open a PR if this fails.

### 5. Open PR

Push and create PR with clear description linking to the task.

### 6. Review and Merge

- CI must pass before requesting review
- Agent review first, then human approval
- Address review feedback
- Squash and merge after explicit human approval

**Never merge without human approval.** Agent reviews catch issues early — they are not permission to merge.

## Git Hooks

The project uses [Husky](https://typicode.github.io/husky/) for git hooks:

| Hook | Trigger | What runs |
|------|---------|-----------|
| **pre-commit** | `git commit` | Lint, format, typecheck (`npm run check`) |
| **pre-push** | `git push` | Full test suite (`npm test`) |

If a hook fails, the operation is blocked. Fix the issue before retrying.

To bypass in emergencies (use sparingly):

```bash
git commit --no-verify   # skip pre-commit
git push --no-verify     # skip pre-push
```

## Tooling

| Command | Purpose |
|---------|---------|
| `make build` | Build all packages (core → engine → cli) |
| `make test` | Run tests |
| `make check` | Lint + format + typecheck |
| `make pre-pr` | Full pre-PR checks (check + test) |
| `make run ARGS="..."` | Run CLI |

## When Stuck

After 3 failed attempts at the same problem:

1. **Stop** — Don't keep trying the same approach
2. **Document** — What was tried and why it failed
3. **Ask** — Request guidance or suggest alternatives
