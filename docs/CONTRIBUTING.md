# Contributing

This project uses an AI-first development process. Agents do the work, automation enforces quality, and humans decide merges.

## Task execution summary template

Before starting implementation, prepare one markdown summary. Use the template below as a starting point and replace placeholders with task-specific details. Checklist lines are examples of what to include. After displaying the Work Summary, ask the user if they want to continue before starting implementation.

```md
## Work Summary

- Task: #<id> — <title>
  Example: #1951 — Implement required-domain capability gating
- Objective: <what this task must achieve>
- In scope:
  - <scope item>
- Out of scope:
  - <out-of-scope item>

### Task acceptance criteria (copy from task)

- [ ] <acceptance criterion 1>
- [ ] <acceptance criterion 2>
- [ ] <acceptance criterion 3>

### Required workflow checklist (example items from CONTRIBUTING)

- [ ] Work only within task scope.
- [ ] Read relevant files before editing.
- [ ] Make the smallest change that satisfies the task.
- [ ] Follow `docs/CODE_STANDARDS.md` and `docs/ARCHITECTURE.md`.
- [ ] Set task status to `inprogress` with `task-update` when implementation starts.
- [ ] Stop and report `BLOCKED` if requirements are blocked, ambiguous, or conflicting.
- [ ] Add task comments only via `task-comment-create`.
- [ ] Do not add manual line breaks in markdown paragraphs.
- [ ] Summarize changed files and verification results in handoff.

### Branch and commit checklist (example)

- [ ] Update local `main` and create a task branch (`feat/`, `fix/`, `docs/`, or `chore/` as appropriate).
- [ ] Use commit format:

  ```text
  <type>: <short description>

  <optional body explaining why>

  Task: #<task-id>
  ```

### Required post-PR pipeline checklist (example)

- [ ] Run `make pre-pr` and fix all failures.
- [ ] Commit changes.
- [ ] Push branch and open/update PR.
- [ ] Wait for CI to pass before requesting review.
- [ ] Treat unhandled rejections and race-signature failures as merge blockers and fix root cause.
- [ ] Run `pr-review` in a visible tmux sub-agent session.
- [ ] Report review result, fix warnings by default unless waived, and fix requested changes.
- [ ] Stop and wait for explicit human merge approval.
- [ ] If CI fails at any point, fix, recommit, push, and wait for passing CI.

### PR pipeline status (copy/paste)

```text
PR Pipeline Status
- local_checks: pass|fail
- push: done|pending
- ci: pass|fail|unavailable-needs-human-decision
- review: pending|approved|warnings|changes-requested
- merge_approval: waiting-human|approved
```

### Verification plan (example)

- [ ] `make check`
- [ ] `make test`
- [ ] <targeted test command>
- [ ] Record pass/fail for each command.

### Documentation updates (example)

- [ ] Update relevant docs in the same PR, or explicitly justify why no doc change is needed.

### Stuck protocol (example)

- [ ] After 3 failed attempts: stop, document attempts and failures, then ask for guidance.
```

## Required workflow

1. Work only within task scope.
2. Read relevant files before editing.
3. Make the smallest change that satisfies the task.
4. Follow [CODE_STANDARDS.md](CODE_STANDARDS.md) and [ARCHITECTURE.md](ARCHITECTURE.md).
5. Use the `task-update` skill to set task status to `inprogress` when implementation starts.
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

1. Run local checks with `make pre-pr` and fix all failures.
2. Commit changes.
3. Push branch and open/update PR.
4. Wait for CI to finish and pass before requesting review.
5. Treat any unhandled rejection or race-signature failure in candidate CI runs as a merge blocker (even if a rerun later passes); root-cause and fix before proceeding.
6. Start independent review in a visible tmux sub-agent and run the `pr-review` skill in that session.
7. Report review result to the human, fix warnings by default unless explicitly waived, and fix all requested changes.
8. Stop and wait for explicit human merge approval (`merge`, `approved`, `LGTM`, etc.).

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
- Any unhandled rejection in CI is treated as a failure and must be fixed, even if retries pass.
- Agent review helps catch issues early and does not grant merge permission.
- Never merge without explicit human approval.
- `main` must be protected by pre-merge CI and merge policy; do not rely on post-merge rollback automation.

## Tooling

| Command | Purpose |
|---------|---------|
| `make build` | Build all packages (core → engine → cli) |
| `make test` | Run unit tests only (fast, no Automerge/storage) |
| `make test-all` | Run all tests including integration tests |
| `make test-integration` | Run integration tests only (Automerge/storage) |
| `make test-sync-server-integration` | Run sync-server-backed integration tests explicitly |
| `make check` | Lint + format + typecheck |
| `make pre-pr` | Full pre-PR checks (check + test) |
| `npm run test:storage-stability` | Repeat storage teardown tests to detect race leaks |
| `make run ARGS="..."` | Run CLI |

For targeted verification during daemon protocol work:

```bash
npm run test:conformance
npm run test -- packages/daemon/src/events-parity.test.ts packages/daemon/src/daemon-engine-parity.test.ts
```

Sync-server-backed integration coverage is opt-in and must be run explicitly:

```bash
make test-sync-server-integration
```

See also:

- [CLI Daemon Usage](cli-daemon-usage.md) for daemon-required CLI behavior
- [Daemon Service Operations](daemon-service-operations.md) for Linux/macOS service setup and lifecycle commands

## When stuck

After 3 failed attempts at the same problem:

1. Stop.
2. Document what was tried and why it failed.
3. Ask for guidance or propose alternatives.
