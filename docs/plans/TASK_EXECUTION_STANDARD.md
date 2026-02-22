# Task Execution Standard (for Phase Work)

Use this standard for every implementation task created from `docs/plans/phase-*.md`.

## 1) Task Size / PR Size

Keep work in small, reviewable units:

- Single concern per task
- Prefer tasks that can be completed and validated in 1-2 focused sessions
- Avoid broad "implement whole phase" tasks
- If scope grows, split into additional tasks before coding

## 2) Required Reading (Task Context)

Every task must list required reading and confirm it was reviewed:

1. `docs/ARCHITECTURE.md`
2. `docs/plans/1923-automerge-sync-refactor-research.md`
3. The phase doc the task comes from (e.g. `docs/plans/phase-3-cli-thin-client.md`)
4. Any directly impacted phase docs (upstream/downstream)

## 3) Required Task Contents

Every task description should include:

- **Objective** (what change this task makes)
- **Scope** (what is included / excluded)
- **Acceptance criteria** (testable, concrete)
- **Verification plan** (which tests/checks prove done)
- **Documentation requirements** (what docs must be updated)

## 4) Documentation Is Mandatory

Every implementation task must include a documentation step in the same PR.

Update whichever docs are impacted:

- `docs/ARCHITECTURE.md` for canonical architecture behavior changes
- Relevant phase doc(s) for scope/progress updates
- Runbook/operational docs if workflow changes

If no documentation update is needed, task must explicitly justify why.

## 5) Completion Checklist (per task)

- [ ] Code changes completed
- [ ] Tests added/updated and passing
- [ ] Documentation updated (or justified)
- [ ] Task comment summarizes implementation + links changed docs

## 6) Agent Guidance

Future AI agents should treat this file as binding for task decomposition and execution quality when working on phase-derived tasks.