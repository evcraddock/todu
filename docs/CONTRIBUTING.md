# Contributing

This project uses an AI-first development process. Agents do the work, and automation enforces quality.

## Task execution summary template

Before starting implementation, prepare one markdown summary. Use the template below as a starting point and replace placeholders with task-specific details.

```md
## Work Summary

- Task: #<id> — <title>
- Objective: <what this task must achieve>
- In scope:
  - <scope item>
- Out of scope:
  - <out-of-scope item>

### Task acceptance criteria (copy from task)

- [ ] <acceptance criterion 1>
- [ ] <acceptance criterion 2>
- [ ] <acceptance criterion 3>

### Concrete plan

1. <specific step 1>
2. <specific step 2>
3. <specific step 3>

The plan must identify the files, workflows, or release steps that will be changed or run.

### Required workflow checklist

- [ ] Set task status to `inprogress` when work begins.

### Verification plan

- [ ] `make check`
- [ ] `make test`
- [ ] <targeted test command>
- [ ] Record pass/fail for each command.

### Documentation updates

- [ ] Update relevant docs in the same PR, or explicitly justify why no doc change is needed.
```

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
6. Run review using the `pr-review` skill.
7. Report review result to the human, fix warnings by default unless explicitly waived, and fix all requested changes.

If CI fails, fix the issue, recommit, push again, and wait for CI to pass.

`main` must be protected by pre-merge CI and merge policy; do not rely on post-merge rollback automation.

Use this status format at gates:

```text
PR Pipeline Status
- local_checks: pass|fail
- push: done|pending
- ci: pass|fail|unavailable
- review: pending|approved|warnings|changes-requested
```
