# Contributing

This project uses an AI-first development process. Agents do the work, automation enforces quality, and humans decide merges.

## Required workflow

1. Work only within task scope.
2. Read relevant files before editing.
3. Make the smallest change that satisfies the task.
4. Follow [CODE_STANDARDS.md](CODE_STANDARDS.md) and [ARCHITECTURE.md](ARCHITECTURE.md).
5. Set task status to `inprogress` when implementation starts.
6. If blocked, ambiguous, or conflicting requirements are found, stop and report `BLOCKED` with reason.
7. Add task comments only via the `task-comment-create` skill.
8. Do not add manual line breaks in markdown paragraphs.
9. Summarize changed files and verification results in your handoff.

## Branch and commits

Start from the latest main branch and create a task branch:

```bash
git checkout main && git pull
git checkout -b feat/{task-id}-short-description
```

Branch prefixes:

- `feat/` — New features
- `fix/` — Bug fixes
- `docs/` — Documentation only
- `chore/` — Maintenance

Commit format:

```text
<type>: <short description>

<optional body explaining why>

Task: #<task-id>
```

## Required post-PR pipeline (non-optional)

After implementation is complete, follow this sequence in order:

1. Commit changes.
2. Push branch and open/update PR.
3. Wait for CI to finish and pass before requesting review.
4. Start independent review in a visible tmux sub-agent and run the `pr-review` skill in that session.
5. Report review result to the human, fix warnings by default unless explicitly waived, and fix all requested changes.
6. Stop and wait for explicit human merge approval (`merge`, `approved`, `LGTM`, etc.).

If CI fails, fix the issue, recommit, push again, and wait for CI to pass.

Use this status format at gates:

```text
PR Pipeline Status
- local_checks: pass|fail
- push: done|pending
- ci: pass|fail|unavailable-needs-human-decision
- review: pending|approved|warnings|changes-requested
- merge_approval: waiting-human|approved
```

## Review and merge rules

- CI must pass before requesting review.
- Agent review helps catch issues early and does not grant merge permission.
- Never merge without explicit human approval.

## Tooling

| Command | Purpose |
|---------|---------|
| `make build` | Build all packages (core → engine → cli) |
| `make test` | Run tests |
| `make check` | Lint + format + typecheck |
| `make run ARGS="..."` | Run CLI |

See also:

- [CLI Daemon Usage](cli-daemon-usage.md) for daemon-required CLI behavior
- [Daemon Service Operations](daemon-service-operations.md) for Linux/macOS service setup and lifecycle commands

## When stuck

After 3 failed attempts at the same problem:

1. Stop.
2. Document what was tried and why it failed.
3. Ask for guidance or propose alternatives.
