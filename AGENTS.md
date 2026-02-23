# AI Agent Guidelines for todu

## Before Starting ANY Task

**ALWAYS use the `task-start-preflight` skill** when you hear:

- "start task", "work on task", "get started", "pick up task"
- "let's do task", "begin task", "tackle task"
- Or any variation of starting work

The preflight ensures you understand the task, check dependencies, and follow project guidelines.

## Required Reading

Before working, read and follow:

- [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) - workflow and PR process
- [docs/CODE_STANDARDS.md](docs/CODE_STANDARDS.md) - code style and patterns

You MUST follow these guidelines throughout your work.

## Skill Compliance Gate (MANDATORY)

When a task maps to a skill document, treat that skill as a checklist, not guidance.

1. **Pre-action checklist**
   - State the skill's key requirements before running commands.
   - If requirements are unclear, stop and ask.

2. **Proof-of-compliance before reporting done**
   - Verify each key requirement with command output.
   - Do not report completion without explicit verification.

3. **Hard fail and self-correct**
   - If any requirement is not met, fix it before responding.
   - Never present partially compliant work as complete.

### `task-create` Validation Rules (MANDATORY)

After creating or updating task descriptions:

- Description must render as valid multiline markdown (not escaped literal `\\n`).
- Run `todu task show <id> --format json` and verify description content.
- Explicitly check and confirm the description does **not** contain literal `\\n` sequences.

## No Discretionary Commands (MANDATORY)

No exploratory/helpful extras. If a command is not clearly required, ask first.
If violated, stop immediately and report the deviation before continuing.

## NEVER Push Directly to Main

**No exceptions. No "quick fixes". No "obvious bugs".**

Always:

1. Create a feature branch (`feat/<task-id>-<description>`)
2. Create a PR
3. Wait for CI to pass
4. Request review
5. Wait for explicit human approval ("merge", "approved", "LGTM")
6. Only then merge

This applies even when:

- You're confident the fix is correct
- It's a one-line change
- You're in the middle of debugging
- The user seems to want it done quickly

**The process exists because the human needs to review and approve changes before they ship.** Pushing directly to main takes that decision away from them. It's irreversible.

## NEVER Merge Without Human Approval

**Agent reviews do not replace human approval.** The agent review is a helper to catch issues early - it is NOT permission to merge.

After an agent review completes:

1. Show the review results to the user
2. **Stop and wait for explicit human approval**
3. Only merge when the user says "merge", "approved", "LGTM", or similar

**DO NOT:**

- Auto-merge after agent review
- Assume approval because the review passed
- Merge and then tell the user about it

**The human decides when to merge. Always.**

## NEVER Use sync.todu.sh in Development

**`sync.todu.sh` is strictly for production use. Never connect to it during development, testing, or CI.**

Use the local sync server instead:

```bash
make dev        # starts local sync server via overmind + docker compose
```

The local sync server runs at `ws://localhost:3030`. Use this URL in all dev/test config.

This applies to:
- Manual testing and development
- Automated tests
- CI pipelines

**Why this matters:** Connecting dev/test instances to the production sync server pollutes real user data and can cause data corruption from untested code.

## Project Overview

Local-first task management with offline support and seamless sync

## Tech Stack

- Language: TypeScript
- Framework: None (monorepo with @todu/core + packages/app)
- Runtime: Bun

## Development

Run `make help` to see all available commands.

Key Makefile targets:

- `make run ARGS="..."` - Run CLI commands
- `make build` - Build all packages
- `make test` - Run tests
- `make lint` - Run linter
- `make check` - Lint + test
- `make pre-pr` - Full pre-PR checks

Note: `make dev` is a placeholder until Phase 2 (Electron). For CLI development, use `make run`.

## Dependencies

When installing packages:

- Use latest **STABLE** versions only
- Reject canary/beta/alpha/rc versions unless user explicitly approves
- Verify stable version: `npm view <package> versions | grep -v '-'`

Non-stable versions (canary, beta, alpha, rc) can have bugs or incomplete features. Always ask before using them.

## Task Lifecycle

- **Starting**: ALWAYS run `task-start-preflight` skill first
- **Closing**: Run `task-close-preflight` skill

## PR Workflow

1. Create feature branch: `feat/<task-id>-<description>`
2. Commit changes with descriptive messages referencing task ID
3. Run `make pre-pr` to verify all checks pass
4. Push branch and create PR with `gh pr create`
5. **Wait for CI to pass** before requesting review
6. Use the `request-review` skill to spawn a separate agent to review the PR
7. **Wait for human approval** before merging

### `request-review` Skill Enforcement (MANDATORY)

When requesting PR review, follow the `request-review` skill **exactly as written**.

- **No substitutions** and **no custom review flow**
- **Do NOT use `pi -p`** (or any non-interactive shortcut) for the reviewer session
- Use tmux session + `wait-for` signaling exactly as documented in the skill
- Wait for completion signal before reporting results
- After completion, fetch and report the latest PR review comment
- If a task ID is present, ensure the review is also posted to the task
- If you must deviate for any reason, **stop and ask the human first**

### Wait for CI Before Requesting Review

After creating a PR, CI runs automatically. **Do not request a review until CI passes.**

Check CI status:

```bash
gh pr view <number> --json statusCheckRollup --jq '.statusCheckRollup[0] | "\(.status) - \(.conclusion // "pending")"'
```

If CI fails:

- Check the failure: `gh run view <run-id> --log-failed`
- Fix the issue, commit, and push
- Wait for CI to pass before requesting review

## Test Failures

**ALL tests must pass. No exceptions.**

If `make pre-pr` shows failing tests, fix them — even if you didn't cause the failure. Pre-existing test failures are not someone else's problem. If you're touching the codebase, you own the test suite.

- Do NOT dismiss failures as "pre-existing" or "unrelated"
- Do NOT skip or ignore failing tests to get a green PR
- If a fix is non-trivial, explain the root cause and fix it properly
- If a test is genuinely obsolete, remove it with justification — don't just disable it

The bar is simple: `make pre-pr` passes with zero failures before creating a PR.

## Conventions

- Use TypeScript strict mode
- Prefer named exports over default exports
- Use path aliases for imports (@/...)
- Handle null explicitly with ?? and ?.
- Write tests with Bun test
